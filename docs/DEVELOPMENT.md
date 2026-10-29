# Kept: Development

Running the server and its tests locally, and deploying it. How it is built is in `IMPLEMENTATION.md`.

## Setup

Needs Node 22.12 or later and Docker.

```sh
npm install
cp .env.example .env
docker compose up -d     # PostgreSQL on port 5433, with the kept_app role and a kept_test database
npm run migrate
npm run create-household -- --name "The Smiths" --owner Sam --email sam@example.com --timezone America/New_York
npm run dev              # http://localhost:3000, OpenAPI at /api/v1/openapi.json
npm run dev:web          # the web UI at http://localhost:5173/app/, passing API calls to :3000
```

The server also serves the last `npm run build` of the web UI at http://localhost:3000/app/. Sign-in codes for the web UI appear in the server log.

`create-household` prints the owner's API key once. Send it as `Authorization: Bearer kept_…`. Without `RESEND_API_KEY`, sign-in codes and invites are written to the server log instead of emailed.

## Trying the MCP server

An MCP client connects to `http://localhost:3000/mcp` and signs in through OAuth2; sign-in codes appear in the server log instead of email. A client that takes a header can skip sign-in with an API key. In Claude Code:

```sh
claude mcp add --transport http kept http://localhost:3000/mcp --header "Authorization: Bearer kept_…"
```

Phone apps need the deployed HTTPS address, set as `PUBLIC_URL`.

## Tests

```sh
npm test                 # unit and integration tests; needs the compose database
npm run test:unit        # the pure functions in src/domain only
npm run typecheck
```

Integration tests drop and recreate the `kept_test` schema, then connect as `kept_app` like the server does, so row-level security is exercised. Set `TEST_DATABASE_HOST` to use a database other than `localhost:5433`.

## Deploying

One host with Docker runs PostgreSQL, Kept and Caddy from `deploy/compose.yaml`; the design is in `IMPLEMENTATION.md` §6. Ports 80 and 443 must be open.

```sh
git clone … kept && cd kept/deploy
cp .env.example .env     # set KEPT_HOST, a domain pointing at the server, and two passwords
docker compose up -d --build
docker compose exec kept node dist/cli/create-household.js --name "The Smiths" --owner Sam --email sam@example.com --timezone America/New_York
```

The server applies migrations each time it starts. Gemini needs a client created for it, with the redirect URI its "Connect to an MCP server" dialog shows. Each member does this on the web UI's Me page, or an administrator runs:

```sh
docker compose exec kept node dist/cli/create-client.js --id gemini --name Gemini --redirect-uri https://oauth-redirect.googleusercontent.com/r/…
```

Connect an assistant to `https://KEPT_HOST/mcp`. With `RESEND_API_KEY` set in `.env` (the domain verified in Resend), sign-in codes and invites are emailed; without it, read them from the log:

```sh
docker compose logs kept | grep -E "Sign-in code|Invite"
```

Update with `git pull && docker compose up -d --build`.

## Layout

- `src/domain`: pure functions for everything the ledger decides (lines and shares, matching, watched groups and coverage, repeat dates, summaries), unit-tested in `test/unit`.
- `src/ledger`: database reads and writes for each feature, run inside a household-scoped transaction.
- `src/mcp`: the MCP server, its tools and the playbook text.
- `src/oauth`: the OAuth2 authorization server, sign-in by emailed code, and the sign-in and consent pages.
- `src/mail`: the emails Kept sends, and the mailers that send them through Resend or write them to the log.
- `src/http`: Fastify routes and their TypeBox schemas, which also generate the OpenAPI spec, and serving the web UI.
- `src/db`: the Kysely connection, the schema types and migrations.
- `web`: the web UI, a React app; `web/src/lib` holds its pure functions, unit-tested in `test/unit/web.test.ts`.
- `src/cli`: `migrate`, `create-household`, `create-client` and `openapi`.
- `deploy`: the production compose file, the Caddyfile and the database role script.