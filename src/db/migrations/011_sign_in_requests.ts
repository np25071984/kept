import { sql, type Kysely } from 'kysely'

// Every sign-in code sent, by email and IP address, so a flood of requests can be refused (IMPLEMENTATION.md §5.4).
// Kept apart from sign_in_codes, whose row for an interaction is replaced each time a code is resent.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE sign_in_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      ip text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX sign_in_requests_email ON sign_in_requests (email, created_at);
    CREATE INDEX sign_in_requests_ip ON sign_in_requests (ip, created_at);
    GRANT SELECT, INSERT, DELETE ON sign_in_requests TO kept_app;
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE sign_in_requests`.execute(db)
}
