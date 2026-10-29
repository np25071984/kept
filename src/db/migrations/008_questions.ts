import { sql, type Kysely } from 'kysely'

// Notifications: Kept's open questions (VISION.md §4.B, §4.C). A duplicate or a missing recurring charge is an update
// until answered; a passed cap and an unused key are worked out when asked, and remember "keep it".
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE updates DROP CONSTRAINT updates_kind_check;
    ALTER TABLE updates ADD CONSTRAINT updates_kind_check CHECK (kind IN ('repeat_registered', 'possible_duplicate', 'missing_charge'));
    ALTER TABLE updates ADD COLUMN repeat_id uuid REFERENCES repeats ON DELETE CASCADE, ADD COLUMN resolved_at timestamptz;
    ALTER TABLE caps ADD COLUMN kept_period text;
    ALTER TABLE api_keys ADD COLUMN kept_at timestamptz;
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE api_keys DROP COLUMN kept_at;
    ALTER TABLE caps DROP COLUMN kept_period;
    ALTER TABLE updates DROP COLUMN resolved_at, DROP COLUMN repeat_id;
  `.execute(db)
}
