import { sql, type Kysely } from 'kysely'

// Every invite a household sent, so a flood of invites can be refused (IMPLEMENTATION.md §4). Kept apart from invites,
// which an owner can cancel.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE invite_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX invite_requests_household ON invite_requests (household_id, created_at);
    ALTER TABLE invite_requests ENABLE ROW LEVEL SECURITY;
    CREATE POLICY household_isolation ON invite_requests
      USING (household_id = nullif(current_setting('app.household_id', true), '')::uuid)
      WITH CHECK (household_id = nullif(current_setting('app.household_id', true), '')::uuid);
    GRANT SELECT, INSERT, DELETE ON invite_requests TO kept_app;
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE invite_requests`.execute(db)
}
