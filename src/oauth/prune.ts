import { sql } from 'kysely'
import type { Db } from '../db/db.js'

// Expired OAuth state (tokens, sessions, interactions, grants) and sign-in codes, which nothing reads again
// (IMPLEMENTATION.md §5.4). Run by the scheduler, so the tables don't grow with every token refresh.
export async function pruneExpired(db: Db): Promise<number> {
  const models = await db.deleteFrom('oauth_models').where('expires_at', '<', sql<Date>`now()`).executeTakeFirst()
  const codes = await db.deleteFrom('sign_in_codes').where('expires_at', '<', sql<Date>`now()`).executeTakeFirst()
  return Number(models.numDeletedRows) + Number(codes.numDeletedRows)
}
