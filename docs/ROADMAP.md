# Kept: Roadmap

Last updated: 2026-10-30.

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

## Phase 4 — Paid Hosting

Charging for the hosted Kept (`VISION.md` §5).

- [ ] Export: a member downloads their own purchases and the household's vocabulary as CSV and JSON, from Settings and over the REST API.
- [ ] An operator report of active households by the `VISION.md` §5 definition, leaving out the operator's own and test households.
- [ ] Billing state per household: trial start and paid-until, and a pure function that decides from them, the launch date and today whether the household may write.
- [ ] Read-only households: the REST API refuses writes with an error that says how to pay, MCP tools pass it to the assistant, and the web UI shows a banner with the pay link.
- [ ] Stripe: Checkout for $2 a month, a webhook that extends paid-until, and the customer portal linked from Settings.
- [ ] A launch command that records the launch date and emails every existing household that its 30-day trial has started.
- [ ] Terms of service, linked beside the privacy policy.

**Gate:** about 100 active households, then the operator runs the launch command.

## Later

- [ ] A privacy policy, linked from the landing page and the sign-in pages. Before sign-up opens to other households.
- [ ] Tips on getting more from an assistant (`VISION.md` §3.4, "Showing members what their assistant can do"): `get_playbook` returns how the member logged in the last 30 days by source; playbook lines for one contextual tip a conversation, remembered once given or declined; the Tips page in the user menu with steps per assistant, kept in step with what Phase 3 records about each; a tips email picked by how the member has logged.
- [ ] Siri through App Intents in a native iOS app (`VISION.md` §4.B, "Other clients"). Not before Phase 3's gate.

## Nice to have

- [ ] Charts in chat: a `get_chart` tool that draws a report chart as an image on the server, in the web UI's style, language and theme, from the summary endpoint. Where an assistant doesn't show the image, a short-lived view-only link to it, totals only; the assistant always says the key numbers too. First, a test tool returning a fixed PNG, to see which of Claude, ChatGPT and Gemini show images from tool results.