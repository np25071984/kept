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

## Later

- [ ] A privacy policy, linked from the landing page and the sign-in pages. Before sign-up opens to other households.
- [ ] Screenshots of the spending graphs on the landing page, from both reports with sample data.
- [ ] Siri through App Intents in a native iOS app (`VISION.md` §4.B, "Other clients"). Not before Phase 3's gate.