import { createHash, randomBytes } from 'node:crypto'
import { sql } from 'kysely'
import { inHousehold, type Db, type Tx } from '../db/db.js'
import { isTimeZone } from '../domain/dates.js'
import { SEED_CATEGORIES, SETUP_STEPS, STEP_STATES, initialSetup, nextStep, type SetupState } from '../domain/setup.js'
import type { Caller } from './caller.js'
import { ApiError, conflict, forbidden, invalid, notFound } from './errors.js'

export const API_KEY_PREFIX = 'kept_'
const INVITE_DAYS = 7

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function newSecret(prefix = ''): string {
  return prefix + randomBytes(32).toString('base64url')
}

export async function issueApiKey(tx: Tx, householdId: string, userId: string, name: string): Promise<{ id: string; key: string }> {
  const key = newSecret(API_KEY_PREFIX)
  const { id } = await tx.insertInto('api_keys').values({ household_id: householdId, user_id: userId, key_hash: hashSecret(key), name }).returning('id').executeTakeFirstOrThrow()
  return { id, key }
}

export function validateCurrency(currency: string): string {
  const code = currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code) || !Intl.supportedValuesOf('currency').includes(code)) throw invalid('invalid_currency', `"${currency}" is not an ISO 4217 currency code.`)
  return code
}

export function validateTimeZone(timezone: string): string {
  if (!isTimeZone(timezone)) throw invalid('invalid_timezone', `"${timezone}" is not an IANA time zone name.`)
  return timezone
}

// A new household with its owner, the seed categories and the owner's first API key. Runs as the table owner.
export async function createHousehold(ownerDb: Db, input: { name: string; currency: string; owner_name: string; owner_email: string; timezone: string }) {
  const currency = validateCurrency(input.currency)
  const timezone = validateTimeZone(input.timezone)
  return ownerDb.transaction().execute(async (tx) => {
    const household = await tx.insertInto('households').values({ name: input.name, currency, timezone, setup: JSON.stringify(initialSetup()) }).returning('id').executeTakeFirstOrThrow()
    await sql`select set_config('app.household_id', ${household.id}, true)`.execute(tx)
    const owner = await tx.insertInto('users').values({ household_id: household.id, name: input.owner_name, email: input.owner_email, role: 'owner' }).returning('id').executeTakeFirstOrThrow()
    await tx.insertInto('categories').values(SEED_CATEGORIES.map((path) => ({ household_id: household.id, path }))).execute()
    const key = await issueApiKey(tx, household.id, owner.id, 'First key')
    return { household_id: household.id, user_id: owner.id, api_key: key.key }
  })
}

export async function authenticate(db: Db, key: string): Promise<Caller | null> {
  if (!key.startsWith(API_KEY_PREFIX)) return null
  const found = await sql<{ user_id: string; household_id: string }>`select * from kept_authenticate(${hashSecret(key)})`.execute(db)
  const row = found.rows[0]
  return row ? callerFor(db, row.user_id, row.household_id) : null
}

// A household created at sign-in by a verified email with no account and no invite (VISION.md §3.6, "One way in").
export async function createHouseholdForEmail(db: Db, input: { name: string; currency: string; timezone: string; owner_name: string; email: string }) {
  const currency = validateCurrency(input.currency)
  const timezone = validateTimeZone(input.timezone)
  const name = input.name.trim()
  const owner = input.owner_name.trim()
  if (!name || !owner) throw invalid('invalid_name', 'Enter the household\'s name and yours.')
  const created = await sql<{ household_id: string; user_id: string }>`
    select * from kept_create_household(${name}, ${currency}, ${timezone}, ${JSON.stringify(initialSetup())}::jsonb, ${owner}, ${input.email})`.execute(db)
  const row = created.rows[0]!
  await inHousehold(db, row.household_id, (tx) => tx.insertInto('categories').values(SEED_CATEGORIES.map((path) => ({ household_id: row.household_id, path }))).execute())
  return row
}

// The caller for a user whose household is known, e.g. from an OAuth2 access token.
export async function callerFor(db: Db, userId: string, householdId?: string): Promise<Caller | null> {
  const household = householdId ?? (await sql<{ household_id: string | null }>`select kept_user_household(${userId}) as household_id`.execute(db)).rows[0]?.household_id
  if (!household) return null
  return inHousehold(db, household, async (tx) => {
    const user = await tx
      .selectFrom('users')
      .innerJoin('households', 'households.id', 'users.household_id')
      .select(['users.id', 'users.name', 'users.role', 'households.timezone', 'households.currency'])
      .where('users.id', '=', userId)
      .executeTakeFirst()
    if (!user) return null
    return { user_id: user.id, household_id: household, role: user.role, name: user.name, timezone: user.timezone, currency: user.currency }
  })
}

// Setup state for the first conversation (VISION.md §3.6).

export async function getSetup(tx: Tx, caller: Caller) {
  const household = await tx.selectFrom('households').select(['name', 'currency', 'timezone', 'setup']).executeTakeFirstOrThrow()
  const user = await tx.selectFrom('users').select(['name', 'email', 'introduced_at', 'role']).where('id', '=', caller.user_id).executeTakeFirstOrThrow()
  const setup = { ...initialSetup(), ...household.setup } as SetupState
  return {
    household: { name: household.name, currency: household.currency, currency_locked: await hasPurchases(tx), timezone: household.timezone, steps: setup, next_step: nextStep(setup) },
    you: { name: user.name, email: user.email, introduced: user.introduced_at != null, role: user.role },
  }
}

// Any purchase in the household, by any member: the currency is fixed from then on.
async function hasPurchases(tx: Tx): Promise<boolean> {
  return (await tx.selectFrom('transactions').select('id').limit(1).executeTakeFirst()) != null
}

// The caller's own profile (VISION.md §4.C, Settings → Profile).
export async function updateMe(tx: Tx, caller: Caller, patch: { name?: string }) {
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw invalid('invalid_name', 'Enter your name.')
    await tx.updateTable('users').set({ name }).where('id', '=', caller.user_id).execute()
  }
  return getSetup(tx, caller)
}

export interface SetupPatch {
  name?: string
  currency?: string
  timezone?: string
  steps?: Record<string, string>
  introduced?: boolean
}

export async function updateSetup(tx: Tx, caller: Caller, patch: SetupPatch) {
  if (patch.currency !== undefined) {
    if (caller.role !== 'owner') throw forbidden('Only an owner can change the household currency.')
    const currency = validateCurrency(patch.currency)
    if ((await hasPurchases(tx)) && currency !== caller.currency) throw conflict('currency_in_use', 'The currency can only change before the first transaction.')
    await tx.updateTable('households').set({ currency }).execute()
  }
  if (patch.name !== undefined) {
    if (caller.role !== 'owner') throw forbidden('Only an owner can rename the household.')
    await tx.updateTable('households').set({ name: patch.name.trim() }).execute()
  }
  if (patch.timezone !== undefined) {
    if (caller.role !== 'owner') throw forbidden('Only an owner can change the household time zone.')
    await tx.updateTable('households').set({ timezone: validateTimeZone(patch.timezone) }).execute()
  }
  if (patch.steps) {
    const current = await tx.selectFrom('households').select('setup').executeTakeFirstOrThrow()
    const next: Record<string, string> = { ...initialSetup(), ...current.setup }
    for (const [step, state] of Object.entries(patch.steps)) {
      if (!(SETUP_STEPS as readonly string[]).includes(step)) throw invalid('invalid_setup_step', `Unknown setup step "${step}".`)
      if (!(STEP_STATES as readonly string[]).includes(state)) throw invalid('invalid_setup_state', `A step is pending, done or later.`)
      next[step] = state
    }
    await tx.updateTable('households').set({ setup: JSON.stringify(next) }).execute()
  }
  if (patch.introduced) await tx.updateTable('users').set({ introduced_at: new Date() }).where('id', '=', caller.user_id).where('introduced_at', 'is', null).execute()
  return getSetup(tx, { ...caller, currency: patch.currency ? validateCurrency(patch.currency) : caller.currency })
}

// Invites (VISION.md §3.6, "Invites come from Kept").

export interface Mailer {
  // `connect` is the MCP address to add to an assistant; signing in there with the invited email joins the household.
  sendInvite(input: { to: string; link: string; connect: string; inviter: string; household: string }): Promise<void>
  sendSignInCode(input: { to: string; code: string; link: string }): Promise<void>
}

export async function createInvite(tx: Tx, caller: Caller, email: string, mailer: Mailer, publicUrl: string) {
  if (caller.role !== 'owner') throw forbidden('Only an owner can invite members.')
  const address = email.trim().toLowerCase()
  const taken = await sql<{ taken: boolean }>`select kept_email_taken(${address}) as taken`.execute(tx)
  if (taken.rows[0]?.taken) throw conflict('email_taken', `${address} already has a Kept account.`)
  const token = newSecret()
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000)
  const invite = await tx
    .insertInto('invites')
    .values({ household_id: caller.household_id, email: address, invited_by: caller.user_id, token_hash: hashSecret(token), expires_at: expiresAt })
    .returning(['id', 'email', 'expires_at'])
    .executeTakeFirstOrThrow()
  const household = await tx.selectFrom('households').select('name').executeTakeFirstOrThrow()
  const base = publicUrl.replace(/\/$/, '')
  await mailer.sendInvite({ to: address, link: `${base}/invite#token=${token}`, connect: `${base}/mcp`, inviter: caller.name, household: household.name })
  return invite
}

export async function deleteInvite(tx: Tx, caller: Caller, id: string) {
  if (caller.role !== 'owner') throw forbidden('Only an owner can cancel invites.')
  const deleted = await tx.deleteFrom('invites').where('id', '=', id).where('accepted_at', 'is', null).returning('id').executeTakeFirst()
  if (!deleted) throw notFound('Open invite')
}

// The invite link's token signs the new member in once; they join as a member and get their first API key.
export async function acceptInvite(db: Db, input: { token: string; name: string }) {
  const found = await sql<{ id: string; household_id: string; email: string; expires_at: Date; accepted_at: Date | null }>`select * from kept_find_invite(${hashSecret(input.token)})`.execute(db)
  const invite = found.rows[0]
  if (!invite || invite.accepted_at || invite.expires_at < new Date()) throw new ApiError(410, 'invite_invalid', 'This invite link is invalid, used or expired.')
  return inHousehold(db, invite.household_id, async (tx) => {
    const userId = await joinHousehold(tx, invite, input.name)
    const key = await issueApiKey(tx, invite.household_id, userId, 'First key')
    return { user_id: userId, api_key: key.key }
  })
}

// Creates the invited member and marks the invite used. Runs inside the invite's household.
export async function joinHousehold(tx: Tx, invite: { id: string; household_id: string; email: string }, name: string): Promise<string> {
  const user = await tx.insertInto('users').values({ household_id: invite.household_id, name: name.trim(), email: invite.email, role: 'member' }).returning('id').executeTakeFirstOrThrow()
  await tx.updateTable('invites').set({ accepted_at: new Date() }).where('id', '=', invite.id).execute()
  return user.id
}

export async function listApiKeys(tx: Tx, caller: Caller) {
  return tx.selectFrom('api_keys').select(['id', 'name', 'created_at', 'last_used_at']).where('user_id', '=', caller.user_id).where('revoked_at', 'is', null).orderBy('created_at').execute()
}

export async function revokeApiKey(tx: Tx, caller: Caller, id: string) {
  const revoked = await tx.updateTable('api_keys').set({ revoked_at: new Date() }).where('id', '=', id).where('user_id', '=', caller.user_id).where('revoked_at', 'is', null).returning('id').executeTakeFirst()
  if (!revoked) throw notFound('API key')
}