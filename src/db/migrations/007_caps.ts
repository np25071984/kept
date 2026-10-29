import { sql, type Kysely } from 'kysely'

// Caps: a member's soft reminders on a category or one of the people & things, per month or year (VISION.md §4.A, "Caps").
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE caps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      category_id uuid REFERENCES categories ON DELETE CASCADE,
      cost_center_id uuid REFERENCES cost_centers ON DELETE CASCADE,
      amount numeric(12, 2) NOT NULL CHECK (amount > 0),
      period text NOT NULL CHECK (period IN ('month', 'year')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((category_id IS NULL) <> (cost_center_id IS NULL))
    );
    ALTER TABLE caps ENABLE ROW LEVEL SECURITY;
    CREATE POLICY household_isolation ON caps
      USING (household_id = nullif(current_setting('app.household_id', true), '')::uuid)
      WITH CHECK (household_id = nullif(current_setting('app.household_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE, DELETE ON caps TO kept_app;
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE caps`.execute(db)
}
