<p align="center"><img src="docs/icons/icon-large.svg" width="128" alt="Kept"></p>

# Kept

Teach your AI assistant to track your household's spending. Tell Claude, ChatGPT or Gemini what you spent, in a sentence, a receipt photo, an order email or a bank statement, and Kept tells it what to ask, how to file the answer and what to remember. Live at [kept-ledger.com](https://kept-ledger.com).

## How it works

- **Your assistant does the reading.** Kept connects to no bank or inbox. The assistant you already use reads what you show it, and Kept keeps what was logged.
- **Kept is the playbook and the ledger.** An MCP server gives the assistant the household's categories, people & things, notes and history, and the rules for asking: lead with the best guess, ask one question at a time, confirm before saving.
- **Everyone in the household signs in as themselves.** Purchases stay their own; the household shares categories and totals, never broken down by member.
- **The web app is for looking back.** Review and fix purchases, see reports, manage recurring bills and the household.

## Documentation

| Document | What it covers |
| --- | --- |
| [`docs/VISION.md`](docs/VISION.md) | What Kept does and why: the agent's behaviour, the ledger's rules, the web app. |
| [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) | How it is built: architecture, data model, REST API, security, MCP server. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What remains, in order. |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Running it locally, tests, deploying, the source layout. |
| [`AGENTS.md`](AGENTS.md) | Conventions for coding agents working in this repository. |
| [`CLAUDE.md`](CLAUDE.md) | `AGENTS.md` plus what applies only to Claude Code. |

## Running it

Node 22.12 or later and Docker. `docs/DEVELOPMENT.md` has the steps, starting with `npm install` and `docker compose up -d`, and how to host your own Kept on one server.

## License

[AGPL-3.0](LICENSE). Self-hosting is free with every feature; the hosted Kept at kept-ledger.com is a paid service (`docs/VISION.md` §5). Contributions are welcome under the agreement in [`CONTRIBUTING.md`](CONTRIBUTING.md), and vulnerabilities go to the address in [`SECURITY.md`](SECURITY.md).