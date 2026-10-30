import { sql } from 'kysely'
import type { Db } from '../db/db.js'
import { CODE_WINDOW_MS } from '../domain/throttle.js'

// Expired OAuth state (tokens, sessions, interactions, grants), sign-in codes and code requests, which nothing reads again
// (IMPLEMENTATION.md §5.4). Run by the scheduler, so the tables don't grow with every token refresh.
export async function pruneExpired(db: Db): Promise<number> {
  const models = await db.deleteFrom('oauth_models').where('expires_at', '<', sql<Date>`now()`).executeTakeFirst()
  const codes = await db.deleteFrom('sign_in_codes').where('expires_at', '<', sql<Date>`now()`).executeTakeFirst()
  const requests = await db.deleteFrom('sign_in_requests').where('created_at', '<', new Date(Date.now() - CODE_WINDOW_MS)).executeTakeFirst()
  return Number(models.numDeletedRows) + Number(codes.numDeletedRows) + Number(requests.numDeletedRows)
}
