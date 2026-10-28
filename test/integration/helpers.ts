import { sql } from 'kysely'
import { createDb, migrateToLatest, type Db } from '../../src/db/db.js'
import { buildApp, type App } from '../../src/http/app.js'
import { createHousehold, type Mailer } from '../../src/ledger/households.js'

const HOST = process.env.TEST_DATABASE_HOST ?? 'localhost:5433'
export const OWNER_URL = `postgres://kept:kept@${HOST}/kept_test`
export const APP_URL = `postgres://kept_app:kept_app@${HOST}/kept_test`

export interface Harness {
  app: App
  db: Db
  owner: Db
  invites: { to: string; link: string }[]
  codes: { to: string; code: string; link: string }[]
  close(): Promise<void>
}

// A fresh schema per test file, with the server connecting as kept_app like in production.
export async function startHarness(): Promise<Harness> {
  const owner = createDb(OWNER_URL)
  await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO kept_app;`.execute(owner)
  await migrateToLatest(owner)
  const db = createDb(APP_URL)
  const invites: { to: string; link: string }[] = []
  const codes: { to: string; code: string; link: string }[] = []
  const mailer: Mailer = {
    async sendInvite({ to, link }) { invites.push({ to, link }) },
    async sendSignInCode(input) { codes.push(input) },
  }
  const app = await buildApp({ db, mailer, publicUrl: 'https://kept.test' })
  return {
    app, db, owner, invites, codes,
    async close() {
      await app.close()
      await db.destroy()
      await owner.destroy()
    },
  }
}

export async function newHousehold(h: Harness, name = 'The Smiths', email = `owner-${Math.random().toString(36).slice(2)}@example.com`) {
  return createHousehold(h.owner, { name, currency: 'USD', owner_name: 'Sam', owner_email: email, timezone: 'America/New_York' })
}

export function client(h: Harness, key: string) {
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) => {
    const response = await h.app.inject({ method, url, headers: { authorization: `Bearer ${key}` }, ...(body !== undefined && { payload: body as object }) })
    return { status: response.statusCode, body: response.body ? response.json() : null }
  }
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, body: unknown) => call('POST', url, body),
    patch: (url: string, body: unknown) => call('PATCH', url, body),
    delete: (url: string) => call('DELETE', url),
  }
}
