import { sql, type Kysely } from 'kysely'

// A verified email with no account and no invite creates a household (VISION.md §3.6, "One way in"). The household
// row doesn't exist yet when the request starts, so row-level security can't admit it; this runs as the table owner.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE FUNCTION kept_create_household(p_name text, p_currency text, p_timezone text, p_setup jsonb, p_owner_name text, p_email text)
    RETURNS TABLE (household_id uuid, user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE h uuid; u uuid;
    BEGIN
      IF EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(p_email)) THEN
        RAISE EXCEPTION 'email already has an account' USING ERRCODE = 'unique_violation';
      END IF;
      INSERT INTO households (name, currency, timezone, setup) VALUES (p_name, p_currency, p_timezone, p_setup) RETURNING id INTO h;
      INSERT INTO users (household_id, name, email, role) VALUES (h, p_owner_name, lower(p_email), 'owner') RETURNING id INTO u;
      RETURN QUERY SELECT h, u;
    END
    $$;
    REVOKE ALL ON FUNCTION kept_create_household(text, text, text, jsonb, text, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION kept_create_household(text, text, text, jsonb, text, text) TO kept_app;
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP FUNCTION kept_create_household(text, text, text, jsonb, text, text)`.execute(db)
}
