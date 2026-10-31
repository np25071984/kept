import { sql, type Kysely } from 'kysely'

// Rules give way to personal notes and watched groups (VISION.md §4.A, "Notes"; §3.3). A watch rule becomes a
// watched group, any other rule a note in its own words; anything household-wide goes to every member. A note's end date
// moves into its text.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE watches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      category_id uuid REFERENCES categories ON DELETE CASCADE,
      item text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((category_id IS NULL) <> (item IS NULL))
    );

    ALTER TABLE watches ENABLE ROW LEVEL SECURITY;
    CREATE POLICY household_isolation ON watches
      USING (household_id = nullif(current_setting('app.household_id', true), '')::uuid)
      WITH CHECK (household_id = nullif(current_setting('app.household_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE, DELETE ON watches TO kept_app;

    INSERT INTO watches (household_id, user_id, category_id, item, created_at)
    SELECT DISTINCT ON (u.id, c.id, lower(r.params->>'item')) r.household_id, u.id, c.id, CASE WHEN c.id IS NULL THEN r.params->>'item' END, r.created_at
    FROM rules r
    JOIN users u ON u.household_id = r.household_id AND (r.user_id IS NULL OR u.id = r.user_id)
    LEFT JOIN categories c ON c.household_id = r.household_id AND lower(c.path) = lower(r.params->>'category')
    WHERE r.kind = 'watch' AND (c.id IS NOT NULL OR r.params->>'item' IS NOT NULL);

    INSERT INTO notes (household_id, text, user_id, created_by, created_at)
    SELECT r.household_id, r.text, u.id, r.created_by, r.created_at
    FROM rules r JOIN users u ON u.household_id = r.household_id AND (r.user_id IS NULL OR u.id = r.user_id)
    WHERE r.kind <> 'watch';

    INSERT INTO notes (household_id, text, user_id, expires_on, created_by, created_at, updated_at)
    SELECT n.household_id, n.text, u.id, n.expires_on, n.created_by, n.created_at, n.updated_at
    FROM notes n JOIN users u ON u.household_id = n.household_id
    WHERE n.user_id IS NULL;
    DELETE FROM notes WHERE user_id IS NULL;
    UPDATE notes SET text = text || ' (until ' || to_char(expires_on, 'FMMonth FMDD, YYYY') || ')' WHERE expires_on IS NOT NULL;

    DROP TABLE rules, note_cost_centers, note_categories;
    ALTER TABLE notes ALTER COLUMN user_id SET NOT NULL, DROP COLUMN merchants, DROP COLUMN created_by, DROP COLUMN expires_on;
  `.execute(db)
}

export async function down(): Promise<void> {
  throw new Error('Rules and note links are gone; restore a backup instead.')
}
