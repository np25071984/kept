import { randomBytes } from 'node:crypto'
import { sql } from 'kysely'
import type { Db } from '../db/db.js'
import { groupConnections, type GrantRow } from '../domain/connections.js'
import type { OAuth } from './provider.js'
import { WEB_CLIENT_ID } from './provider.js'

// A member's connected assistants, and OAuth clients created ahead of time for assistants that ask for a client ID and
// secret instead of registering (IMPLEMENTATION.md §5.4). OAuth state has no household, so these filter by account.

export interface ConnectionView {
  client_id: string
  name: string
  web: boolean
  connected_at: string
  last_used_at: string
}

async function grantsOf(db: Db, userId: string, clientId?: string) {
  return db
    .selectFrom('oauth_models')
    .select(['id', sql<string>`payload->>'clientId'`.as('client_id'), sql<string>`payload->>'iat'`.as('iat')])
    .where('name', '=', 'Grant')
    .where(sql`payload->>'accountId'`, '=', userId)
    .$if(clientId !== undefined, (q) => q.where(sql`payload->>'clientId'`, '=', clientId!))
    .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', sql<Date>`now()`)]))
    .execute()
}

// The clients the member has a live grant for, the web UI's included.
export async function connectedClientIds(db: Db, userId: string): Promise<string[]> {
  return (await grantsOf(db, userId)).map((g) => g.client_id)
}

export async function listConnections(db: Db, oauth: OAuth, userId: string): Promise<ConnectionView[]> {
  const grants = await grantsOf(db, userId)
  if (grants.length === 0) return []
  const used = await db
    .selectFrom('oauth_models')
    .select(['grant_id', sql<string>`max((payload->>'iat')::bigint)`.as('last')])
    .where('grant_id', 'in', grants.map((g) => g.id))
    .where('name', 'in', ['AccessToken', 'RefreshToken'])
    .groupBy('grant_id')
    .execute()
  const lastByGrant = new Map(used.map((row) => [row.grant_id, Number(row.last)]))
  const rows: GrantRow[] = grants.map((g) => ({ client_id: g.client_id, issued_at: Number(g.iat), last_used_at: lastByGrant.get(g.id) ?? null }))
  return Promise.all(
    groupConnections(rows).map(async (c) => ({
      client_id: c.client_id,
      name: (await oauth.provider.Client.find(c.client_id))?.clientName ?? c.client_id,
      web: c.client_id === WEB_CLIENT_ID,
      connected_at: new Date(c.connected_at * 1000).toISOString(),
      last_used_at: new Date(c.last_used_at * 1000).toISOString(),
    })),
  )
}

// Ends every grant this member gave the client, with its tokens; the assistant has to sign in again.
export async function disconnect(db: Db, userId: string, clientId: string): Promise<number> {
  const ids = (await grantsOf(db, userId, clientId)).map((g) => g.id)
  if (ids.length === 0) return 0
  await db.deleteFrom('oauth_models').where('grant_id', 'in', ids).execute()
  await db.deleteFrom('oauth_models').where('name', '=', 'Grant').where('id', 'in', ids).execute()
  return ids.length
}

export interface CreatedClient {
  client_id: string
  client_secret: string
}

// Stores a confidential client with these redirect URIs. Called again with the same id, it replaces the secret.
export async function saveClient(db: Db, input: { id: string; name: string; redirectUris: string[] }): Promise<CreatedClient> {
  const secret = randomBytes(32).toString('hex')
  const payload = JSON.stringify({
    client_id: input.id,
    client_secret: secret,
    client_name: input.name,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: input.redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  })
  await db
    .insertInto('oauth_models')
    .values({ name: 'Client', id: input.id, payload })
    .onConflict((oc) => oc.columns(['name', 'id']).doUpdateSet({ payload }))
    .execute()
  return { client_id: input.id, client_secret: secret }
}

export function newClientId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assistant'
  return `${slug}-${randomBytes(6).toString('hex')}`
}
