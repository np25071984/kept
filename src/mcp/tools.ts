import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { StartPath } from '../domain/setup.js'
import { Id, IdParams } from '../api/common.js'
import { InviteBody, SetupPatch } from '../api/household.js'
import { AnswerBody, MissingBody, QuestionParams, SummaryQuery } from '../api/ledger.js'
import { MergeBody, SourceBody, TransactionBatch, TransactionPatch, TransactionQuery } from '../api/transactions.js'
import {
  capCall, ManageCaps, ManageNotes, ManageRepeats, ManageVocabulary, ManageWatches, noteCall, query, repeatCall, vocabularyCall, watchCall, type Method, type Planned,
} from './actions.js'
import { FIRST_MEMBER, NEW_MEMBER, PLAYBOOK, resumeSetup } from './playbook.js'

// Every tool is a thin call to the REST API as the same caller (IMPLEMENTATION.md §5.1).

export type Rest = (method: Method, url: string, body?: unknown) => Promise<{ status: number; body: unknown }>

const read = { readOnlyHint: true, openWorldHint: false } as const
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const
const destroy = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const

function result(response: { status: number; body: unknown }): CallToolResult {
  const text = response.status === 204 ? '{"ok":true}' : JSON.stringify(response.body)
  return { content: [{ type: 'text', text }], isError: response.status >= 400 }
}

async function forward(rest: Rest, planned: Planned): Promise<CallToolResult> {
  if (!planned.ok) return result({ status: 400, body: { error: planned.error } })
  return result(await rest(planned.call.method, planned.call.url, planned.call.body))
}

const START_WITH: Record<Exclude<StartPath, 'resume'>, string> = {
  first_member: FIRST_MEMBER,
  new_member: NEW_MEMBER,
  done: 'Setup is done. Handle the user\'s request.',
}

// The playbook, the household's vocabulary, the user's notes and watched groups, and what to do first, in one call.
export async function playbook(rest: Rest) {
  const [setup, categories, costCenters, notes, watches, caps, questions] = await Promise.all([
    rest('GET', '/api/v1/setup'),
    rest('GET', '/api/v1/categories'),
    rest('GET', '/api/v1/cost-centers'),
    rest('GET', '/api/v1/notes'),
    rest('GET', '/api/v1/watches'),
    rest('GET', '/api/v1/caps'),
    rest('GET', '/api/v1/questions'),
  ])
  const s = setup.body as { household: { currency: string; timezone: string; next_step: string | null }; start: StartPath; today: string }
  return {
    start_with: s.start === 'resume' ? resumeSetup(s.household.next_step!) : START_WITH[s.start],
    today: s.today,
    timezone: s.household.timezone,
    currency: s.household.currency,
    setup: setup.body,
    categories: (categories.body as { categories: { path: string }[] }).categories.map((c) => c.path),
    cost_centers: (costCenters.body as { cost_centers: unknown[] }).cost_centers,
    notes: (notes.body as { notes: unknown[] }).notes,
    watching: (watches.body as { watches: unknown[] }).watches,
    caps: (caps.body as { caps: unknown[] }).caps,
    questions: (questions.body as { questions: unknown[] }).questions,
    playbook: PLAYBOOK,
  }
}

export function registerTools(server: McpServer, rest: Rest) {
  server.registerTool('get_playbook', {
    title: 'Get the playbook',
    description: 'Call this first in every conversation, before asking the user anything about money. Returns how to ask about and log expenses (follow it), what to do first (start_with: the first conversation when setup is unfinished), today\'s date, the household\'s categories and cost centers, and the user\'s notes and watched groups. Read the notes before asking anything.',
    annotations: read,
  }, async () => ({ content: [{ type: 'text', text: JSON.stringify(await playbook(rest)) }] }))

  server.registerTool('get_updates', {
    title: 'Get updates',
    description: 'Call at the start of a conversation, after get_playbook. Returns what the ledger did since the user last heard (repeats registered, possible duplicates) and marks it seen. Mention each in one line; for a possible duplicate, ask whether the two are the same purchase.',
    annotations: { ...read, readOnlyHint: false, idempotentHint: false },
  }, async () => result(await rest('POST', '/api/v1/updates/take')))

  server.registerTool('log_transaction', {
    title: 'Log transactions',
    description: 'Write one or more purchases. Only after the user confirmed the final record you showed them ("Log $60.00 to Car/Fuel for the Kia, today?"). Each is matched against purchases already logged: "created", "attached" (tell the user what changed, and what was kept because they edited it) or "possible_duplicate" (ask if it\'s the same purchase; merge_transactions if yes). "warnings" flags a date the user may not have meant; ask them.',
    inputSchema: TransactionBatch,
    annotations: write,
  }, async ({ transactions }) => result(await rest('POST', '/api/v1/transactions', { transactions })))

  server.registerTool('list_transactions', {
    title: 'List transactions',
    description: 'The user\'s own purchases, newest first. Use it for best guesses: the usual category at a merchant, the usual car, the last split, existing item names. Never includes other members\' purchases.',
    inputSchema: TransactionQuery.pick({ from: true, to: true, merchant: true, category: true, cost_center: true, item: true, limit: true }),
    annotations: read,
  }, async (args) => result(await rest('GET', `/api/v1/transactions${query(args)}`)))

  server.registerTool('edit_transaction', {
    title: 'Edit a transaction',
    description: 'Change one of the user\'s purchases after they confirmed the change, e.g. "I returned the shoes, it was $18". Edited fields win over later receipts and statements. line_items replaces all explicit line items.',
    inputSchema: IdParams.extend(TransactionPatch.shape),
    annotations: write,
  }, async ({ id, ...patch }) => result(await rest('PATCH', `/api/v1/transactions/${id}`, patch)))

  server.registerTool('delete_transaction', {
    title: 'Delete a transaction',
    description: 'Delete one of the user\'s purchases, after they confirmed.',
    inputSchema: IdParams,
    annotations: destroy,
  }, async ({ id }) => result(await rest('DELETE', `/api/v1/transactions/${id}`)))

  server.registerTool('add_source', {
    title: 'Add a source',
    description: 'Attach what you read from a receipt, bill, email or statement to a purchase already logged, e.g. a receipt sent later. Send the receipt\'s line_items (grouped) and checked_groups; the response lists what changed.',
    inputSchema: IdParams.extend(SourceBody.shape),
    annotations: write,
  }, async ({ id, ...body }) => result(await rest('POST', `/api/v1/transactions/${id}/sources`, body)))

  server.registerTool('merge_transactions', {
    title: 'Merge two transactions',
    description: 'After the user agreed two logged purchases are the same one: merges other_id into id, keeping both sets of sources, and deletes other_id.',
    inputSchema: IdParams.extend(MergeBody.shape),
    annotations: destroy,
  }, async ({ id, other_id }) => result(await rest('POST', `/api/v1/transactions/${id}/merge`, { other_id })))

  server.registerTool('manage_vocabulary', {
    title: 'Change categories or people & things',
    description: 'Add, rename or delete a category (what: category, name is its path, e.g. "Car/Fuel") or a person or thing the household spends for (what: cost_center, "cost centers" in the API). get_playbook returns both. Each only after the user said yes to that change, asked on its own. add: a name that isn\'t in the household is often a typo for one that is, so ask first; a subcategory\'s parent must exist; a cost center needs its kind. rename fixes a name or moves a category ("Gas" to "Car/Fuel"); purchases, watched groups and repeats keep it, and subcategories move with it. delete works only when nothing uses it; otherwise Kept says what does: offer to move those purchases with edit_transaction, or to rename instead.',
    inputSchema: ManageVocabulary,
    annotations: destroy,
  }, async (args) => forward(rest, vocabularyCall(args)))

  server.registerTool('manage_watches', {
    title: 'Watch a group or stop watching',
    description: 'start: ask about a group where it\'s bought, after the user asked ("keep an eye on alcohol", "track snacks"): a category, which may need manage_vocabulary add first, or an item bought across categories. stop: stop asking ("stop tracking snacks"), by the id from get_playbook\'s watching; past purchases don\'t change.',
    inputSchema: ManageWatches,
    annotations: destroy,
  }, async (args) => forward(rest, watchCall(args)))

  server.registerTool('answer_question', {
    title: 'Answer an open question',
    description: 'Record the user\'s answer to one of get_playbook\'s questions. duplicate: merge or different; cap: remove or keep; missing_charge: stop or still_paying; unused_key: revoke or keep.',
    inputSchema: QuestionParams.extend(AnswerBody.shape),
    annotations: write,
  }, async ({ id, answer }) => result(await rest('POST', `/api/v1/questions/${encodeURIComponent(id)}/answer`, { answer })))

  server.registerTool('flag_missing_charge', {
    title: 'Flag a missing recurring charge',
    description: 'A statement should have included a recurring charge and didn\'t, and the user hasn\'t said whether they cancelled it: keep it as an open question.',
    inputSchema: MissingBody.extend({ repeat_id: Id }),
    annotations: write,
  }, async ({ repeat_id, period }) => result(await rest('POST', `/api/v1/repeats/${repeat_id}/missing`, { period })))

  server.registerTool('manage_caps', {
    title: 'Set, change or remove a cap',
    description: 'A cap is a soft reminder the user asked for, after they confirmed; it never blocks a purchase. set: a category or one of the people & things, an amount, per month or year ("cap eating out at $250 a month"). change: the amount or period ("make the groceries cap $1,200"). remove: "drop my groceries cap". change and remove take the id from get_playbook\'s caps.',
    inputSchema: ManageCaps,
    annotations: destroy,
  }, async (args) => forward(rest, capCall(args)))

  server.registerTool('manage_notes', {
    title: 'Save, update or delete a note',
    description: 'save: remember something about the user\'s spending, in their words, after telling them what you\'ll remember: a habit ("Costco is always groceries"), a split, a store that\'s always private, or a plan. Write any time as a date ("We\'re selling the Kia in December 2026"), never "next month". Never save silently. update: change a note\'s text after the user agreed. delete: forget a note after the user asked. update and delete take the id from get_playbook\'s notes.',
    inputSchema: ManageNotes,
    annotations: destroy,
  }, async (args) => forward(rest, noteCall(args)))

  server.registerTool('manage_repeats', {
    title: 'Recurring purchases',
    description: 'set: make a logged purchase repeat, after the user confirmed the schedule ("repeat it on the 27th of every month?"); the ledger then logs it on each date and get_updates announces it. list: the user\'s repeats with their next date and amount. update: change a repeat from its next date ("the phone is $55 from now on", "rent moves to the 1st"), or pause and resume it. stop: stop repeating; purchases already logged stay.',
    inputSchema: ManageRepeats,
    annotations: destroy,
  }, async (args) => forward(rest, repeatCall(args)))

  server.registerTool('get_summary', {
    title: 'Get a spending summary',
    description: 'Totals by category, person or thing (group_by cost_center), item or merchant, per month, year or in total. scope "me" (default) is the user\'s own spending, private included; "household" is every member\'s non-private spending, never by member. Watched groups come with checked_share and estimate: say how reliable the total is.',
    inputSchema: SummaryQuery,
    annotations: read,
  }, async (args) => result(await rest('GET', `/api/v1/expenses/summary${query(args)}`)))

  server.registerTool('update_setup', {
    title: 'Update setup',
    description: 'Save confirmed first-conversation answers: currency (owner, before the first purchase), the household\'s time zone (owner), step states (basics, cost_centers, categories, watch, invite: done or later), and introduced: true once you introduced Kept.',
    inputSchema: SetupPatch,
    annotations: write,
  }, async (args) => result(await rest('PATCH', '/api/v1/setup', args)))

  server.registerTool('invite_member', {
    title: 'Invite a member',
    description: 'Invite someone in the household by email, after the user confirmed. Kept emails them a sign-in link. Owners only.',
    inputSchema: InviteBody,
    annotations: { ...write, openWorldHint: true },
  }, async (args) => result(await rest('POST', '/api/v1/invites', args)))
}