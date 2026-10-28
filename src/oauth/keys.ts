import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import type { Db } from '../db/db.js'

export interface OAuthKeys {
  jwks: { keys: Record<string, unknown>[] }
  cookieKeys: string[]
}

// The signing key and cookie secrets are created on first start and kept in the database, so every restart and every
// server process signs with the same ones.
export async function loadKeys(db: Db): Promise<OAuthKeys> {
  const existing = await db.selectFrom('oauth_keys').select(['jwks', 'cookie_keys']).where('id', '=', 1).executeTakeFirst()
  if (existing) return { jwks: existing.jwks, cookieKeys: existing.cookie_keys }
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...privateKey.export({ format: 'jwk' }), kid: randomUUID(), alg: 'RS256', use: 'sig' }
  const cookieKeys = [randomBytes(32).toString('base64url')]
  await db.insertInto('oauth_keys').values({ id: 1, jwks: JSON.stringify({ keys: [jwk] }), cookie_keys: cookieKeys }).onConflict((oc) => oc.column('id').doNothing()).execute()
  const stored = await db.selectFrom('oauth_keys').select(['jwks', 'cookie_keys']).where('id', '=', 1).executeTakeFirstOrThrow()
  return { jwks: stored.jwks, cookieKeys: stored.cookie_keys }
}
