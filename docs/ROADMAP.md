# Kept: Roadmap

Last updated: 2026-10-28.

## How to read this document

The remaining work toward the product `VISION.md` describes, in order. Each task points at the section holding its design: `VISION.md` for what it does, `IMPLEMENTATION.md` for how it is built. Each phase ends with a gate that must pass before the next phase starts. A phase whose every box is checked is deleted.

## Phase 2 — MCP Server

The playbook, delivered to any assistant.

- [x] Kept's own OAuth2 authorization server on `oidc-provider`, mounted in Fastify: authorization code with PKCE, dynamic client registration, refresh tokens, discovery metadata; one login per household member (`IMPLEMENTATION.md` §4, §6).
- [x] Every tool in `IMPLEMENTATION.md` §5.1 as a thin call to the REST API, including `get_playbook`.
- [x] Write the playbook: the question rules from `VISION.md` §3 as server instructions, and the same text returned by `get_playbook`, including the first conversation for a new household and a new member (`VISION.md` §3.6). Review the wording once real assistants run it (Phase 3).
- [x] Tool descriptions that work without server instructions: when to call `get_playbook`, and that `log_transaction` comes only after confirmation (`IMPLEMENTATION.md` §5.3).
- [x] Resources for the household's vocabulary and the prompts `setup_household`, `log_expense` and `catch_up` (`IMPLEMENTATION.md` §5.2).
- [ ] Send email: pick a provider and replace the logging `Mailer` for sign-in codes and invites (`IMPLEMENTATION.md` §5.4, §6).
- [x] Docker Compose deployment with Caddy: `Dockerfile` and `deploy/` (`IMPLEMENTATION.md` §6).
- [x] Deploy on the VPS and create the first household (`DEVELOPMENT.md`).
- [ ] Give the server a domain and set `KEPT_HOST`: Gemini rejects the `sslip.io` name, and a temporary Cloudflare quick tunnel stands in (`IMPLEMENTATION.md` §6).

**Gate:** Kept connects as a custom app in Gemini on the web, and the conversation in `VISION.md` §3.1 runs end to end from the Gemini phone app.

## Phase 3 — Integration & Testing

Real use, across assistants.

- [ ] Connect Claude, Gemini and ChatGPT, and try Grok and Perplexity. Record what each phone app supports, write tools especially, and correct the table in `VISION.md` §4.B.
- [ ] Run every conversation in `VISION.md` §3.1–§3.5 in each assistant; tune the playbook and tool descriptions where one strays.
- [ ] Receipt scans, a card statement batch, and one purchase arriving from talk, an email and a statement (`VISION.md` §3.3, §3.4).
- [ ] The first conversation in each assistant: from an empty household, resumed after an interruption, with "later" answers, and for an invited member joining (`VISION.md` §3.6).
- [ ] Two members on different assistants: shared rules and notes reach both, purchases stay private.
- [ ] Decide on the messaging bot: build it if a target assistant can't write from its phone app (`VISION.md` §4.B).

**Gate:** one household logs a full month of spending through its assistants alone, and the month's summary matches its bank statements.

## Phase 4 — Web UI

Looking back, fixing and managing (`VISION.md` §4.C).

- [ ] Sign-in, household creation, and owners inviting and removing members.
- [ ] Updates, Repeats and My purchases pages, with editing, privacy and merging.
- [ ] Household and Me pages: shared vocabulary, rules and notes, connecting an assistant, API keys.
- [ ] A design document for spending graphs, then the My spending and Household spending pages.

**Gate:** every correction an agent conversation can make can also be made in the web UI.

## Later

- [ ] Siri through App Intents in a native iOS app (`VISION.md` §4.B, "Other clients"). Not before Phase 3's gate.