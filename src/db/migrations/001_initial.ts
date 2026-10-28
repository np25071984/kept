import { sql, type Kysely } from 'kysely'

// Every household-scoped table carries household_id and a row-level security policy on it (IMPLEMENTATION.md §4).
const SCOPED_TABLES = [
  'households', 'users', 'api_keys', 'categories', 'cost_centers', 'cost_center_categories', 'invites',
  'repeats', 'transactions', 'line_items', 'line_item_cost_centers', 'sources', 'updates', 'rules',
  'notes', 'note_cost_centers', 'note_categories',
]

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kept_app') THEN
        CREATE ROLE kept_app NOLOGIN;
      END IF;
    END $$;

    CREATE TABLE households (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid GENERATED ALWAYS AS (id) STORED,
      name text NOT NULL,
      currency char(3) NOT NULL,
      setup jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      name text NOT NULL,
      email text NOT NULL,
      role text NOT NULL CHECK (role IN ('owner', 'member')),
      timezone text NOT NULL,
      introduced_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX users_email ON users (lower(email));

    CREATE TABLE api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      key_hash text NOT NULL UNIQUE,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz,
      revoked_at timestamptz
    );

    CREATE TABLE categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      path text NOT NULL
    );
    CREATE UNIQUE INDEX categories_path ON categories (household_id, lower(path));

    CREATE TABLE cost_centers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      name text NOT NULL,
      kind text NOT NULL
    );
    CREATE UNIQUE INDEX cost_centers_name ON cost_centers (household_id, lower(name));

    CREATE TABLE cost_center_categories (
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      cost_center_id uuid NOT NULL REFERENCES cost_centers ON DELETE CASCADE,
      category_id uuid NOT NULL REFERENCES categories ON DELETE CASCADE,
      PRIMARY KEY (cost_center_id, category_id)
    );

    CREATE TABLE invites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      email text NOT NULL,
      invited_by uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      accepted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE repeats (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      template jsonb NOT NULL,
      frequency text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
      "interval" integer NOT NULL DEFAULT 1 CHECK ("interval" > 0),
      anchor date NOT NULL,
      next_date date NOT NULL,
      ends_on date,
      remaining integer CHECK (remaining >= 0),
      paused boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      spent_by uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      date date NOT NULL,
      occurred_at timestamptz,
      timezone text NOT NULL,
      amount numeric(14, 2) NOT NULL CHECK (amount > 0),
      private boolean NOT NULL DEFAULT false,
      merchant text,
      notes text,
      main_category_id uuid REFERENCES categories,
      repeat_id uuid REFERENCES repeats ON DELETE SET NULL,
      checked_groups text[] NOT NULL DEFAULT '{}',
      user_edited text[] NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX transactions_spent_by_date ON transactions (spent_by, date DESC);
    CREATE INDEX transactions_household_date ON transactions (household_id, date);

    CREATE TABLE line_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      transaction_id uuid NOT NULL REFERENCES transactions ON DELETE CASCADE,
      position integer NOT NULL,
      amount numeric(14, 2) NOT NULL CHECK (amount > 0),
      category_id uuid NOT NULL REFERENCES categories,
      item text,
      notes text,
      is_rest boolean NOT NULL DEFAULT false
    );
    CREATE INDEX line_items_transaction ON line_items (transaction_id);

    CREATE TABLE line_item_cost_centers (
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      line_item_id uuid NOT NULL REFERENCES line_items ON DELETE CASCADE,
      cost_center_id uuid NOT NULL REFERENCES cost_centers,
      share numeric(7, 6) CHECK (share > 0 AND share <= 1),
      PRIMARY KEY (line_item_id, cost_center_id)
    );

    CREATE TABLE sources (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      transaction_id uuid NOT NULL REFERENCES transactions ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('talk', 'photo', 'document', 'email', 'statement', 'other')),
      received_at timestamptz NOT NULL DEFAULT now(),
      extracted jsonb
    );
    CREATE INDEX sources_transaction ON sources (transaction_id);

    CREATE TABLE updates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('repeat_registered', 'possible_duplicate')),
      text text NOT NULL,
      transaction_id uuid REFERENCES transactions ON DELETE CASCADE,
      other_transaction_id uuid REFERENCES transactions ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      seen_at timestamptz
    );
    CREATE INDEX updates_user_unseen ON updates (user_id) WHERE seen_at IS NULL;

    CREATE TABLE rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('watch', 'ask_breakdown', 'set_category', 'set_spent_for', 'set_private')),
      user_id uuid REFERENCES users ON DELETE CASCADE,
      merchant text,
      category_id uuid REFERENCES categories ON DELETE CASCADE,
      account_ref text,
      params jsonb NOT NULL DEFAULT '{}',
      text text NOT NULL,
      created_by uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (kind <> 'set_private' OR user_id IS NOT NULL)
    );

    CREATE TABLE notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      text text NOT NULL,
      user_id uuid REFERENCES users ON DELETE CASCADE,
      merchants text[] NOT NULL DEFAULT '{}',
      expires_on date,
      created_by uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE note_cost_centers (
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      note_id uuid NOT NULL REFERENCES notes ON DELETE CASCADE,
      cost_center_id uuid NOT NULL REFERENCES cost_centers ON DELETE CASCADE,
      PRIMARY KEY (note_id, cost_center_id)
    );

    CREATE TABLE note_categories (
      household_id uuid NOT NULL REFERENCES households ON DELETE CASCADE,
      note_id uuid NOT NULL REFERENCES notes ON DELETE CASCADE,
      category_id uuid NOT NULL REFERENCES categories ON DELETE CASCADE,
      PRIMARY KEY (note_id, category_id)
    );
  `.execute(db)

  for (const table of SCOPED_TABLES) {
    await sql`
      ALTER TABLE ${sql.table(table)} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY household_isolation ON ${sql.table(table)}
        USING (household_id = nullif(current_setting('app.household_id', true), '')::uuid)
        WITH CHECK (household_id = nullif(current_setting('app.household_id', true), '')::uuid);
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${sql.table(table)} TO kept_app;
    `.execute(db)
  }

  // Lookups that happen before the caller's household is known run as the table owner, past row-level security.
  await sql`
    CREATE FUNCTION kept_authenticate(p_key_hash text)
    RETURNS TABLE (user_id uuid, household_id uuid)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE api_keys SET last_used_at = now()
      WHERE key_hash = p_key_hash AND revoked_at IS NULL
      RETURNING api_keys.user_id, api_keys.household_id
    $$;

    CREATE FUNCTION kept_find_invite(p_token_hash text)
    RETURNS TABLE (id uuid, household_id uuid, email text, expires_at timestamptz, accepted_at timestamptz)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT id, household_id, email, expires_at, accepted_at FROM invites WHERE token_hash = p_token_hash
    $$;

    CREATE FUNCTION kept_email_taken(p_email text)
    RETURNS boolean
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(p_email))
    $$;

    -- Repeats due today in their owner's time zone, across every household, for the scheduler.
    CREATE FUNCTION kept_due_repeats()
    RETURNS TABLE (id uuid, household_id uuid)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT r.id, r.household_id FROM repeats r JOIN users u ON u.id = r.user_id
      WHERE NOT r.paused AND r.next_date <= (now() AT TIME ZONE u.timezone)::date
    $$;

    REVOKE ALL ON FUNCTION kept_authenticate(text), kept_find_invite(text), kept_email_taken(text), kept_due_repeats() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION kept_authenticate(text), kept_find_invite(text), kept_email_taken(text), kept_due_repeats() TO kept_app;
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(db)
}