import { createHash, randomInt } from 'node:crypto'
import { sql } from 'kysely'
import { inHousehold, type Db } from '../db/db.js'
import { joinHousehold, type Mailer } from '../ledger/households.js'

// Members sign in with a six-digit code emailed to them (IMPLEMENTATION.md §6). The code is typed into the browser that
// started sign-in: on a phone the assistant's sign-in browser and the mail app's browser are different, so a link alone
// would arrive without the sign-in session.

const CODE_MINUTES = 10
const JOIN_MINUTES = 15
const MAX_ATTEMPTS = 5

function hashCode(uid: string, code: string): string {
  return createHash('sha256').update(`${uid}:${code}`).digest('hex')
}

interface OpenInvite {
  id: string
  household_id: string
  household_name: string
  inviter_name: string
}

async function findUser(db: Db, email: string) {
  return (await sql<{ user_id: string; household_id: string }>`select * from kept_user_by_email(${email})`.execute(db)).rows[0] ?? null
}

async function findInvite(db: Db, email: string): Promise<OpenInvite | null> {
  return (await sql<OpenInvite>`select * from kept_open_invite(${email})`.execute(db)).rows[0] ?? null
}

// Sends a code when the email has an account or an open invite. The page says the same either way, so it doesn't reveal who has an account.
export async function sendCode(db: Db, mailer: Mailer, uid: string, email: string, link: (code: string) => string): Promise<void> {
  const address = email.trim().toLowerCase()
  if (!(await findUser(db, address)) && !(await findInvite(db, address))) return
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.deleteFrom('sign_in_codes').where('interaction_uid', '=', uid).execute()
  await db
    .insertInto('sign_in_codes')
    .values({ interaction_uid: uid, email: address, code_hash: hashCode(uid, code), expires_at: new Date(Date.now() + CODE_MINUTES * 60_000) })
    .execute()
  await mailer.sendSignInCode({ to: address, code, link: link(code) })
}

export type Verified = { kind: 'user'; user_id: string } | { kind: 'invite'; invite: OpenInvite; email: string } | { kind: 'invalid' }

export async function verifyCode(db: Db, uid: string, code: string): Promise<Verified> {
  const row = await db.selectFrom('sign_in_codes').selectAll().where('interaction_uid', '=', uid).executeTakeFirst()
  if (!row || row.verified_at || row.expires_at < new Date() || row.attempts >= MAX_ATTEMPTS) return { kind: 'invalid' }
  if (row.code_hash !== hashCode(uid, code.replace(/\D/g, ''))) {
    await db.updateTable('sign_in_codes').set({ attempts: row.attempts + 1 }).where('id', '=', row.id).execute()
    return { kind: 'invalid' }
  }
  await db.updateTable('sign_in_codes').set({ verified_at: new Date() }).where('id', '=', row.id).execute()
  const user = await findUser(db, row.email)
  if (user) return { kind: 'user', user_id: user.user_id }
  const invite = await findInvite(db, row.email)
  return invite ? { kind: 'invite', invite, email: row.email } : { kind: 'invalid' }
}

// An invited person who verified their email joins with the name and time zone they give.
export async function joinWithVerifiedEmail(db: Db, uid: string, name: string, timezone: string): Promise<string | null> {
  const row = await db
    .selectFrom('sign_in_codes')
    .select(['email', 'verified_at'])
    .where('interaction_uid', '=', uid)
    .where('verified_at', 'is not', null)
    .executeTakeFirst()
  if (!row?.verified_at || Date.now() - new Date(row.verified_at).getTime() > JOIN_MINUTES * 60_000) return null
  const invite = await findInvite(db, row.email)
  if (!invite) return null
  const userId = await inHousehold(db, invite.household_id, (tx) => joinHousehold(tx, { ...invite, email: row.email }, name, timezone))
  await db.deleteFrom('sign_in_codes').where('interaction_uid', '=', uid).execute()
  return userId
}

export async function invitedHousehold(db: Db, uid: string): Promise<OpenInvite | null> {
  const row = await db.selectFrom('sign_in_codes').select('email').where('interaction_uid', '=', uid).where('verified_at', 'is not', null).executeTakeFirst()
  return row ? findInvite(db, row.email) : null
}