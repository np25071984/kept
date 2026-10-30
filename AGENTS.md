# AGENTS.md

Orientation for coding agents working in this repository. Read this first, then the document that covers what you are about to change.

## What Kept is

Kept teaches the user's own AI assistant to track a household's expenses: what to ask, how to group the answers, and what to remember. The ledger stores the records, but the product is the agent's behavior. `docs/VISION.md` §1 says what it is. Five boundaries apply to every change:
- Kept reads no banks, inboxes or receipts itself: the user's AI does, and Kept keeps what it learns (`VISION.md` §3.4). Kept stores what was read, never the files.
- Nothing is written without the user's confirmation, and notes are never saved silently (`VISION.md` §3.1, §4.A).
- The server decides who is calling: `spent_by` comes from the login, every read is filtered on the server, and no member sees another member's purchases (`VISION.md` §4.A, `IMPLEMENTATION.md` §4).
- Business logic, matching and authorization live in the REST API; the MCP server only describes and forwards (`IMPLEMENTATION.md` §1).
- Every assistant must work with tools alone; server instructions, resources and prompts are extras (`IMPLEMENTATION.md` §5.3).

## Documentation rules

**Update the documents in the same change.** When a change alters something a document specifies, edit that document in the same commit.

**Citations.** Documents cite each other by section number: `VISION.md` §3.4, `IMPLEMENTATION.md` §5.1. Name the document before the number unless the citation points into the same file. Never renumber a section: a deleted one leaves a gap.

**One fact, one home.** Each kind of content lives in one document, and every other document points to it by section number instead of restating it:
- `docs/VISION.md`: product scope, the agent's behavior, the rules the ledger enforces, and what each part is for. No schema, endpoints, payloads, task lists, dates or progress.
- `docs/IMPLEMENTATION.md`: how Kept is built: architecture, data model, REST API, security and the MCP server. Name a file or function only as a pointer.
- `docs/ROADMAP.md`: remaining tasks and their order, without arguing scope.
- `docs/DEVELOPMENT.md`: running Kept and its tests locally, deploying it, and the source layout.
- `docs/icons/`: the app icon's master SVG and how the served copies are made.
- `README.md`: what Kept is, for someone arriving at the repository, pointing to the documents above.
- `CONTRIBUTING.md`: how outside contributors work and the contributor license agreement.
- `SECURITY.md`: how to report a vulnerability.
- `AGENTS.md`: orientation and conventions only.
- `CLAUDE.md`: imports `AGENTS.md` and adds what applies only to Claude Code.

When `VISION.md` changes a position, scan the other documents for restatements of the old position and fix each one or replace it with a pointer.

**Document what exists.** When a feature, table, endpoint or section is removed, delete its text: no "(removed)" stub, no history, no placeholder kept for a section number. Describe a changed decision as it stands today. Something that does not exist appears only as a plan (`ROADMAP.md`) or as much motivation as an existing feature needs.

**Draw instead of describe.** A flow, sequence, state machine or set of relations is a Mermaid diagram, followed by a few lines for what it cannot show: invariants and traps.

**Write tight.** One statement per fact, and at most one cross-reference per paragraph unless more are load-bearing. Cut intensifiers ("deliberately", "genuinely", "actually", "simply", "just", "really"); "not X but Y" contrasts where nobody proposed X; meta-narration ("This section…", "As noted above…", "It is worth noting…"); history ("now", "no longer", "originally", "used to"); em-dash chains and stacked parentheticals; a reason restated beside the pointer to it; lists of three where one item carries the point; closing sentences that summarize the paragraph. The same applies to code comments, diagram labels, commit messages and pull request descriptions.

## Asking questions

When a request is ambiguous, a detail is missing, or it can be read more than one way, ask before acting. A short question costs less than redoing work built on a wrong assumption.

## Code and tests

New code puts what it decides (which watched groups a purchase checked, whether a charge matches a purchase, when a repeat falls next) in functions that take values and return values, with no database, network, clock or framework object in them, and unit-tests them in the same change. Code touched for another reason gets the same treatment. The wiring around them stays thin, covered by a few end-to-end flows instead of mocks.

A file past about 600 lines is a split candidate: when adding to one, move the touched feature out first. This is not a blocker, and an API client or a parser can stay long.

## Commits and pull requests

Work on a branch and open a pull request. `main` changes only through merged pull requests, and deploys run from it. Once a pull request is merged, delete its branch locally and on the remote.

## Markdown style

- Do not hard-wrap. Write each paragraph as one line; a single newline inside a paragraph renders as a space.
- No blank lines between consecutive list items or block elements unless asked.
- No trailing newline at the end of a `.md` file.
- Preserve the existing newline density when editing.