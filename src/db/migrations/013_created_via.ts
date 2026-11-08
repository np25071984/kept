import { sql, type Kysely } from 'kysely'

// The OAuth client that wrote each purchase and note, for finding which assistant made a bad record (IMPLEMENTATION.md §2).
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE transactions ADD COLUMN created_via text;
    ALTER TABLE notes ADD COLUMN created_via text;
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE transactions DROP COLUMN created_via;
    ALTER TABLE notes DROP COLUMN created_via;
  `.execute(db)
}
