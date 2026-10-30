import { sql, type Kysely } from 'kysely'

// Indexes for lookups by member and by cost center, measured against a heavy household (IMPLEMENTATION.md §6), and the
// caller loaded in the same query that checks a key or token. Not indexed: line_items(category_id), which made the
// planner read every line of a category when a report asked for one year.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE INDEX line_item_cost_centers_cost_center ON line_item_cost_centers (cost_center_id);
    CREATE INDEX updates_user_open ON updates (user_id) WHERE resolved_at IS NULL;
    CREATE INDEX notes_user ON notes (user_id);
    CREATE INDEX watches_user ON watches (user_id);
    CREATE INDEX caps_user ON caps (user_id);
    CREATE INDEX repeats_user ON repeats (user_id);
    CREATE INDEX repeats_due ON repeats (next_date) WHERE NOT paused;

    -- No time zone is more than 14 hours ahead of UTC, so the first condition lets repeats_due narrow the scan.
    CREATE OR REPLACE FUNCTION kept_due_repeats()
    RETURNS TABLE (id uuid, household_id uuid)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT r.id, r.household_id FROM repeats r JOIN households h ON h.id = r.household_id
      WHERE NOT r.paused AND r.next_date <= (now() + interval '14 hours')::date AND r.next_date <= (now() AT TIME ZONE h.timezone)::date
    $$;

    -- The caller behind an API key, in one query. last_used_at is shown to the day, so it is written at most every five minutes.
    DROP FUNCTION kept_authenticate(text);
    CREATE FUNCTION kept_authenticate(p_key_hash text)
    RETURNS TABLE (user_id uuid, household_id uuid, name text, role text, timezone text, currency text)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      WITH k AS (SELECT id, user_id, household_id, last_used_at FROM api_keys WHERE key_hash = p_key_hash AND revoked_at IS NULL),
      touched AS (
        UPDATE api_keys SET last_used_at = now() FROM k
        WHERE api_keys.id = k.id AND (k.last_used_at IS NULL OR k.last_used_at < now() - interval '5 minutes')
      )
      SELECT k.user_id, k.household_id, u.name, u.role, h.timezone, h.currency::text
      FROM k JOIN users u ON u.id = k.user_id JOIN households h ON h.id = k.household_id
    $$;

    -- The caller behind an OAuth access token, whose user the token names.
    CREATE FUNCTION kept_user_caller(p_user_id uuid)
    RETURNS TABLE (user_id uuid, household_id uuid, name text, role text, timezone text, currency text)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.household_id, u.name, u.role, h.timezone, h.currency::text
      FROM users u JOIN households h ON h.id = u.household_id WHERE u.id = p_user_id
    $$;

    REVOKE ALL ON FUNCTION kept_authenticate(text), kept_user_caller(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION kept_authenticate(text), kept_user_caller(uuid) TO kept_app;
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP FUNCTION kept_user_caller(uuid);
    DROP FUNCTION kept_authenticate(text);
    CREATE FUNCTION kept_authenticate(p_key_hash text)
    RETURNS TABLE (user_id uuid, household_id uuid)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE api_keys SET last_used_at = now()
      WHERE key_hash = p_key_hash AND revoked_at IS NULL
      RETURNING api_keys.user_id, api_keys.household_id
    $$;
    REVOKE ALL ON FUNCTION kept_authenticate(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION kept_authenticate(text) TO kept_app;
    CREATE OR REPLACE FUNCTION kept_due_repeats()
    RETURNS TABLE (id uuid, household_id uuid)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT r.id, r.household_id FROM repeats r JOIN households h ON h.id = r.household_id
      WHERE NOT r.paused AND r.next_date <= (now() AT TIME ZONE h.timezone)::date
    $$;
    DROP INDEX repeats_due, repeats_user, caps_user, watches_user, notes_user, updates_user_open, line_item_cost_centers_cost_center;
  `.execute(db)
}
