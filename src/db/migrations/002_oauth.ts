import { sql, type Kysely } from 'kysely'

// OAuth2 state and sign-in codes belong to no household, so these tables have no row-level security (IMPLEMENTATION.md §4).
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    -- Every oidc-provider model: clients, grants, sessions, interactions, codes and tokens.
    CREATE TABLE oauth_models (
      name text NOT NULL,
      id text NOT NULL,
      payload jsonb NOT NULL,
      grant_id text,
      user_code text,
      uid text,
      expires_at timestamptz,
      consumed_at timestamptz,
      PRIMARY KEY (name, id)
    );
    CREATE INDEX oauth_models_grant ON oauth_models (grant_id);
    CREATE INDEX oauth_models_uid ON oauth_models (uid);
    CREATE INDEX oauth_models_expires ON oauth_models (expires_at);

    -- Signing keys and cookie secrets, created on first start.
    CREATE TABLE oauth_keys (
      id integer PRIMARY KEY CHECK (id = 1),
      jwks jsonb NOT NULL,
      cookie_keys text[] NOT NULL
    );

    CREATE TABLE sign_in_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      interaction_uid text NOT NULL,
      email text NOT NULL,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      verified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX sign_in_codes_interaction ON sign_in_codes (interaction_uid);

    GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_models, oauth_keys, sign_in_codes TO kept_app;

    CREATE FUNCTION kept_user_by_email(p_email text)
    RETURNS TABLE (user_id uuid, household_id uuid)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT id, household_id FROM users WHERE lower(email) = lower(p_email)
    $$;

    CREATE FUNCTION kept_user_household(p_user_id uuid)
    RETURNS uuid
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT household_id FROM users WHERE id = p_user_id
    $$;

    -- The newest open invite for an email without an account.
    CREATE FUNCTION kept_open_invite(p_email text)
    RETURNS TABLE (id uuid, household_id uuid, household_name text, inviter_name text)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT i.id, i.household_id, h.name, u.name
      FROM invites i JOIN households h ON h.id = i.household_id JOIN users u ON u.id = i.invited_by
      WHERE lower(i.email) = lower(p_email) AND i.accepted_at IS NULL AND i.expires_at > now()
      ORDER BY i.created_at DESC LIMIT 1
    $$;

    REVOKE ALL ON FUNCTION kept_user_by_email(text), kept_user_household(uuid), kept_open_invite(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION kept_user_by_email(text), kept_user_household(uuid), kept_open_invite(text) TO kept_app;
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP FUNCTION kept_user_by_email(text), kept_user_household(uuid), kept_open_invite(text);
    DROP TABLE sign_in_codes, oauth_keys, oauth_models;
  `.execute(db)
}