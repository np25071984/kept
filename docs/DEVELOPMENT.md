# Kept: Development

Running the server and its tests locally. How it is built is in `IMPLEMENTATION.md`.

## Setup

Needs Node 22.12 or later and Docker.

```sh
npm install
cp .env.example .env
docker compose up -d     # PostgreSQL on port 5433, with the kept_app role and a kept_test database
npm run migrate
npm run create-household -- --name "The Smiths" --owner Sam --email sam@example.com --timezone America/New_York
npm run dev              # http://localhost:3000, OpenAPI at /api/v1/openapi.json
```

`create-household` prints the owner's API key once. Send it as `Authorization: Bearer kept_…`. Invite links are logged by the server instead of emailed.

## Tests

```sh
npm test                 # unit and integration tests; needs the compose database
npm run test:unit        # the pure functions in src/domain only
npm run typecheck
```

Integration tests drop and recreate the `kept_test` schema, then connect as `kept_app` like the server does, so row-level security is exercised. Set `TEST_DATABASE_HOST` to use a database other than `localhost:5433`.

## Layout

- `src/domain`: pure functions for everything the ledger decides (lines and shares, matching, rules, coverage, repeat dates, summaries), unit-tested in `test/unit`.
- `src/ledger`: database reads and writes for each feature, run inside a household-scoped transaction.
- `src/http`: Fastify routes and their TypeBox schemas, which also generate the OpenAPI spec.
- `src/db`: the Kysely connection, the schema types and migrations.
- `src/cli`: `migrate`, `create-household` and `openapi`.
