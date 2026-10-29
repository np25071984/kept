import { sql, type Kysely } from 'kysely'

// The time zone belongs to the household (VISION.md §3.6): it starts as the first owner's.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE households ADD COLUMN timezone text;
    UPDATE households h SET timezone = coalesce(
      (SELECT u.timezone FROM users u WHERE u.household_id = h.id AND u.role = 'owner' ORDER BY u.created_at LIMIT 1),
      'UTC');
    ALTER TABLE households ALTER COLUMN timezone SET NOT NULL;
    ALTER TABLE users DROP COLUMN timezone;

    -- Repeats due today in their household's time zone, across every household, for the scheduler.
    CREATE OR REPLACE FUNCTION kept_due_repeats()
    RETURNS TABLE (id uuid, household_id uuid)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT r.id, r.household_id FROM repeats r JOIN households h ON h.id = r.household_id
      WHERE NOT r.paused AND r.next_date <= (now() AT TIME ZONE h.timezone)::date
    $$;
  `.execute(db)
}

export async function down(): Promise<void> {
  throw new Error('Members no longer have their own time zones; restore a backup instead.')
}
