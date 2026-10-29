import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { Migrator } from 'kysely/migration'
import pg from 'pg'
import * as initial from './migrations/001_initial.js'
import * as oauth from './migrations/002_oauth.js'
import * as memory from './migrations/003_memory.js'
import type { Database } from './schema.js'

// Dates stay 'YYYY-MM-DD' strings; JavaScript Date would shift them by the machine's time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

export type Db = Kysely<Database>
export type Tx = Transaction<Database>

export function createDb(connectionString: string): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 10 }) }) })
}

// Runs `fn` in a transaction scoped to one household: row-level security admits only that household's rows (IMPLEMENTATION.md §4).
export async function inHousehold<T>(db: Db, householdId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`select set_config('app.household_id', ${householdId}, true)`.execute(tx)
    return fn(tx)
  })
}

export function migrator(db: Kysely<any>): Migrator {
  return new Migrator({
    db,
    provider: { getMigrations: async () => ({ '001_initial': initial, '002_oauth': oauth, '003_memory': memory }) },
  })
}

export async function migrateToLatest(db: Kysely<any>): Promise<void> {
  const { error, results } = await migrator(db).migrateToLatest()
  for (const result of results ?? []) {
    if (result.status === 'Error') throw new Error(`Migration ${result.migrationName} failed`)
  }
  if (error) throw error
}