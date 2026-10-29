import { sql, type Kysely } from 'kysely'

// A member's language for the web app and Kept's emails (VISION.md §4.C). Empty: the browser's.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN language text CHECK (language IN ('en', 'ru'))`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN language`.execute(db)
}
