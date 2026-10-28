import { sql } from 'kysely'
import type { Adapter, AdapterPayload } from 'oidc-provider'
import type { Db } from '../db/db.js'

// Stores every oidc-provider model in one table, so clients, grants and tokens survive restarts.
export function postgresAdapter(db: Db) {
  return class PostgresAdapter implements Adapter {
    constructor(private readonly name: string) {}

    async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
      await db
        .insertInto('oauth_models')
        .values({ name: this.name, id, payload: JSON.stringify(payload), grant_id: payload.grantId ?? null, user_code: payload.userCode ?? null, uid: payload.uid ?? null, expires_at: expiresAt })
        .onConflict((oc) => oc.columns(['name', 'id']).doUpdateSet({ payload: JSON.stringify(payload), grant_id: payload.grantId ?? null, user_code: payload.userCode ?? null, uid: payload.uid ?? null, expires_at: expiresAt }))
        .execute()
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
      return this.findBy('id', id)
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
      return this.findBy('uid', uid)
    }

    async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
      return this.findBy('user_code', userCode)
    }

    async consume(id: string): Promise<void> {
      await db.updateTable('oauth_models').set({ consumed_at: new Date() }).where('name', '=', this.name).where('id', '=', id).execute()
    }

    async destroy(id: string): Promise<void> {
      await db.deleteFrom('oauth_models').where('name', '=', this.name).where('id', '=', id).execute()
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      await db.deleteFrom('oauth_models').where('grant_id', '=', grantId).execute()
    }

    private async findBy(column: 'id' | 'uid' | 'user_code', value: string): Promise<AdapterPayload | undefined> {
      const row = await db
        .selectFrom('oauth_models')
        .select(['payload', 'consumed_at'])
        .where('name', '=', this.name)
        .where(column, '=', value)
        .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', sql<Date>`now()`)]))
        .executeTakeFirst()
      if (!row) return undefined
      return { ...row.payload, ...(row.consumed_at && { consumed: Math.floor(new Date(row.consumed_at).getTime() / 1000) }) } as AdapterPayload
    }
  }
}
