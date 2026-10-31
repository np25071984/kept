import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { sql } from 'kysely'
import { inHousehold, type Db } from '../db/db.js'
import type { Language } from '../domain/language.js'
import { CODE_MINUTES, CODE_WINDOW_MS, codeAllowed, codeUsable, withinJoinWindow } from '../domain/throttle.js'
import { createHouseholdForEmail, joinHousehold, type Mailer } from '../ledger/households.js'

// Members sign in with a six-digit code emailed to them (IMPLEMENTATION.md §5.4). The code is typed into the browser that
// started sign-in: on a phone the assistant's sign-in browser and the mail app's browser are different, so a link alone
// would arrive without the sign-in session.

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

// Every email gets a code, so the pages never reveal who has an account (VISION.md §3.6, "One way in"), up to the hourly
// limits per email and per IP address.
export async function sendCode(db: Db, mailer: Mailer, uid: string, email: string, ip: string, link: (code: string) => string, language: Language = 'en'): Promise<'sent' | 'limited'> {
  const address = email.trim().toLowerCase()
  const since = new Date(Date.now() - CODE_WINDOW_MS)
  const earlier = await db.selectFrom('sign_in_requests').select(['email', 'ip', 'created_at']).where('created_at', '>', since).where((eb) => eb.or([eb('email', '=', address), eb('ip', '=', ip)])).execute()
  const at = (key: 'email' | 'ip', value: string) => earlier.filter((r) => r[key] === value).map((r) => new Date(r.created_at))
  if (!codeAllowed(at('email', address), at('ip', ip), new Date())) return 'limited'
  await db.insertInto('sign_in_requests').values({ email: address, ip }).execute()
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.deleteFrom('sign_in_codes').where('interaction_uid', '=', uid).execute()
  await db
    .insertInto('sign_in_codes')
    .values({ interaction_uid: uid, email: address, code_hash: hashCode(uid, code), expires_at: new Date(Date.now() + CODE_MINUTES * 60_000) })
    .execute()
  await mailer.sendSignInCode({ to: address, code, link: link(code), language })
  return 'sent'
}

export type Verified = { kind: 'user'; user_id: string } | { kind: 'invite'; invite: OpenInvite; email: string } | { kind: 'new'; email: string } | { kind: 'invalid' }

export async function verifyCode(db: Db, uid: string, code: string): Promise<Verified> {
  // Counting the try in the same statement that reads the row keeps tries sent at once from sharing one count.
  const row = await db
    .updateTable('sign_in_codes')
    .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
    .where('interaction_uid', '=', uid)
    .returningAll()
    .executeTakeFirst()
  if (!row || !codeUsable(row, new Date())) return { kind: 'invalid' }
  if (!timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(hashCode(uid, code.replace(/\D/g, '')), 'hex'))) return { kind: 'invalid' }
  await db.updateTable('sign_in_codes').set({ verified_at: new Date() }).where('id', '=', row.id).execute()
  const user = await findUser(db, row.email)
  if (user) return { kind: 'user', user_id: user.user_id }
  const invite = await findInvite(db, row.email)
  return invite ? { kind: 'invite', invite, email: row.email } : { kind: 'new', email: row.email }
}

// An invited person who verified their email joins with the name they give.
export async function joinWithVerifiedEmail(db: Db, uid: string, name: string): Promise<string | null> {
  const row = await db
    .selectFrom('sign_in_codes')
    .select(['email', 'verified_at'])
    .where('interaction_uid', '=', uid)
    .where('verified_at', 'is not', null)
    .executeTakeFirst()
  if (!row || !withinJoinWindow(row.verified_at, new Date())) return null
  const invite = await findInvite(db, row.email)
  if (!invite) return null
  const userId = await inHousehold(db, invite.household_id, (tx) => joinHousehold(tx, { ...invite, email: row.email }, name))
  await db.deleteFrom('sign_in_codes').where('interaction_uid', '=', uid).execute()
  return userId
}

export async function invitedHousehold(db: Db, uid: string): Promise<OpenInvite | null> {
  const row = await db.selectFrom('sign_in_codes').select(['email', 'verified_at']).where('interaction_uid', '=', uid).where('verified_at', 'is not', null).executeTakeFirst()
  return row && withinJoinWindow(row.verified_at, new Date()) ? findInvite(db, row.email) : null
}
// A verified email with no account and no invite creates a household and becomes its owner.
export async function createWithVerifiedEmail(db: Db, uid: string, input: { name: string; owner_name: string; currency: string; timezone: string; language?: Language }): Promise<string | null> {
  const row = await db.selectFrom('sign_in_codes').select(['email', 'verified_at']).where('interaction_uid', '=', uid).where('verified_at', 'is not', null).executeTakeFirst()
  if (!row || !withinJoinWindow(row.verified_at, new Date())) return null
  if ((await findUser(db, row.email)) || (await findInvite(db, row.email))) return null
  const created = await createHouseholdForEmail(db, { ...input, email: row.email })
  await db.deleteFrom('sign_in_codes').where('interaction_uid', '=', uid).execute()
  return created.user_id
}

export async function verifiedNewEmail(db: Db, uid: string): Promise<string | null> {
  const row = await db.selectFrom('sign_in_codes').select(['email', 'verified_at']).where('interaction_uid', '=', uid).where('verified_at', 'is not', null).executeTakeFirst()
  if (!row || !withinJoinWindow(row.verified_at, new Date()) || (await findUser(db, row.email)) || (await findInvite(db, row.email))) return null
  return row.email
}
