import { sql, type Kysely } from 'kysely'

// The assistant tells which people & things a purchase could be for from their kind (VISION.md §3.1, Step 4).
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE cost_center_categories`.execute(db)
}

export async function down(): Promise<void> {
  throw new Error('Links between cost centers and categories are gone; restore a backup instead.')
}
