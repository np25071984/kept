# Kept: Roadmap

Last updated: 2026-10-29.

## How to read this document

The remaining work toward the product `VISION.md` describes, in order. Each task points at the section holding its design: `VISION.md` for what it does, `IMPLEMENTATION.md` for how it is built. Each phase ends with a gate that must pass before the next phase starts. A phase whose every box is checked is deleted.

## Phase 3 — Integration & Testing

Real use, across assistants.

- [ ] Connect Claude, Gemini and ChatGPT, and try Grok and Perplexity. Record what each phone app supports, write tools especially, and correct the table in `VISION.md` §4.B.
- [ ] Run every conversation in `VISION.md` §3.1–§3.5 in each assistant; tune the playbook and tool descriptions where one strays.
- [ ] Receipt scans, a card statement batch, and one purchase arriving from talk, an email and a statement (`VISION.md` §3.3, §3.4).
- [ ] The first conversation in each assistant: from an empty household, resumed after an interruption, with "later" answers, and for an invited member joining (`VISION.md` §3.6).
- [ ] Two members on different assistants: the shared vocabulary reaches both, notes and purchases stay private.
- [ ] Decide on the messaging bot: build it if a target assistant can't write from its phone app (`VISION.md` §4.B).

**Gate:** one household logs a full month of spending through its assistants alone, and the month's summary matches its bank statements.

## Phase 4 — Web UI

Looking back, fixing and managing (`VISION.md` §4.C). Started before Phase 3's gate, so the month of real use has somewhere to review and fix what was logged.

- [x] Sign-in with the emailed code (`IMPLEMENTATION.md` §5.4).
- [x] Updates and My purchases pages, with editing, privacy and merging.
- [ ] One sign-in for everyone: a verified email with no account and no invite is offered to create a household, on the web and in assistants (`VISION.md` §3.6). Owners invite and remove members.
- [ ] Repeats page.
- [ ] Paging for My purchases, and filters for source, privacy and a merchant-or-item search.
- [ ] Profile on the Me page (name, time zone) and household settings (name, currency).
- [x] Notes replace rules: personal notes loaded in full at the start, watched groups on their own, a new member asked what to watch (`VISION.md` §4.A, "Notes").
- [ ] Caps: storage, API, tools, the playbook's reminders, the Me section and the My spending line (`VISION.md` §4.A, "Caps").
- [x] Household and Me pages: shared vocabulary, watched groups and notes, connecting an assistant, API keys.
- [x] Mockups of every page, the spending graphs included (`docs/mockups/`).
- [ ] My spending and Household spending pages, as `docs/mockups/my-spending.html` and `household-spending.html` show.

**Gate:** every correction an agent conversation can make can also be made in the web UI.

## Later

- [ ] Landing page at `/`, as `docs/mockups/landing.html` shows, and a privacy policy linked from it and the sign-in pages. Before sign-up opens to other households.
- [ ] Siri through App Intents in a native iOS app (`VISION.md` §4.B, "Other clients"). Not before Phase 3's gate.