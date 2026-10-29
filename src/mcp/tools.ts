import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { todayIn } from '../domain/dates.js'
import { FIRST_MEMBER, NEW_MEMBER, PLAYBOOK, resumeSetup } from './playbook.js'

// Every tool is a thin call to the REST API as the same caller (IMPLEMENTATION.md §5.1).

export type Rest = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) => Promise<{ status: number; body: unknown }>

const read = { readOnlyHint: true, openWorldHint: false } as const
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const
const destroy = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD')
const amount = z.number().positive()
const spentFor = z.array(z.object({
  cost_center: z.string().describe('An existing person or thing (cost center) by name.'),
  share: z.number().gt(0).lte(1).nullish().describe('Fraction of the line. Omit to split the remainder evenly.'),
}))
const lineItem = z.object({
  amount,
  category: z.string().describe('An existing category path, e.g. "Car/Fuel".'),
  item: z.string().nullish().describe('Free text to track, e.g. "snacks", "shoes".'),
  notes: z.string().nullish(),
  spent_for: spentFor.optional(),
})
const sourceKind = z.enum(['talk', 'photo', 'document', 'email', 'statement', 'other'])
const transactionFields = {
  date: date.optional().describe('Local date of the purchase. Defaults to today in the user\'s time zone.'),
  occurred_at: z.string().optional().describe('Exact moment, ISO 8601, when a receipt or statement shows it.'),
  timezone: z.string().optional().describe('IANA zone where it happened, if not the user\'s, e.g. "Asia/Tokyo".'),
  merchant: z.string().nullish(),
  notes: z.string().nullish().describe('E.g. the original amount and rate of a foreign purchase.'),
  private: z.boolean().optional().describe('Left out of household totals.'),
  category: z.string().nullish().describe('Main category: the whole purchase, or the rest beside line_items.'),
  spent_for: spentFor.optional().describe('Who or what the main category was for.'),
  line_items: z.array(lineItem).optional().describe('Only the parts the user priced; the rest goes to category.'),
  checked_groups: z.array(z.string()).optional().describe('Watched groups the user answered about, "no" included.'),
}
const transaction = z.object({
  ...transactionFields,
  amount: amount.describe('Total paid, in the household currency.'),
  source: z.object({ kind: sourceKind.optional(), extracted: z.record(z.string(), z.unknown()).optional() }).optional().describe('Where this came from. Default "talk".'),
})
const id = z.string().uuid()

function result(response: { status: number; body: unknown }): CallToolResult {
  const text = response.status === 204 ? '{"ok":true}' : JSON.stringify(response.body)
  return { content: [{ type: 'text', text }], isError: response.status >= 400 }
}

function query(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : ''
}

// The playbook, the household's vocabulary, the user's notes and watched groups, and what to do first, in one call.
export async function playbook(rest: Rest, now = new Date()) {
  const [setup, categories, costCenters, notes, watches] = await Promise.all([
    rest('GET', '/api/v1/setup'),
    rest('GET', '/api/v1/categories'),
    rest('GET', '/api/v1/cost-centers'),
    rest('GET', '/api/v1/notes'),
    rest('GET', '/api/v1/watches'),
  ])
  const s = setup.body as { household: { name: string; currency: string; next_step: string | null }; you: { introduced: boolean; role: string; timezone: string } }
  let startWith = 'Setup is done. Handle the user\'s request.'
  if (!s.you.introduced) startWith = s.you.role === 'owner' && s.household.next_step ? FIRST_MEMBER : NEW_MEMBER
  else if (s.you.role === 'owner' && s.household.next_step) startWith = resumeSetup(s.household.next_step)
  return {
    start_with: startWith,
    today: todayIn(s.you.timezone, now),
    timezone: s.you.timezone,
    currency: s.household.currency,
    setup: setup.body,
    categories: (categories.body as { categories: { path: string }[] }).categories.map((c) => c.path),
    cost_centers: (costCenters.body as { cost_centers: unknown[] }).cost_centers,
    notes: (notes.body as { notes: unknown[] }).notes,
    watching: (watches.body as { watches: unknown[] }).watches,
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
  }, async () => {
    const updates = await rest('GET', '/api/v1/updates')
    const ids = (updates.body as { updates?: { id: string }[] }).updates?.map((u) => u.id) ?? []
    if (ids.length) await rest('POST', '/api/v1/updates/seen', { ids })
    return result(updates)
  })

  server.registerTool('log_transaction', {
    title: 'Log transactions',
    description: 'Write one or more purchases. Only after the user confirmed the final record you showed them ("Log $60.00 to Car/Fuel for the Kia, today?"). Each is matched against purchases already logged: "created", "attached" (tell the user what changed, and what was kept because they edited it) or "possible_duplicate" (ask if it\'s the same purchase; merge_transactions if yes). "warnings" flags a date the user may not have meant; ask them.',
    inputSchema: { transactions: z.array(transaction).min(1).describe('One entry per purchase; a statement batch goes in one call.') },
    annotations: write,
  }, async ({ transactions }) => result(await rest('POST', '/api/v1/transactions', { transactions })))

  server.registerTool('list_transactions', {
    title: 'List transactions',
    description: 'The user\'s own purchases, newest first. Use it for best guesses: the usual category at a merchant, the usual car, the last split, existing item names. Never includes other members\' purchases.',
    inputSchema: {
      from: date.optional(), to: date.optional(), merchant: z.string().optional(), category: z.string().optional(),
      cost_center: z.string().optional(), item: z.string().optional(), limit: z.number().int().min(1).max(500).optional(),
    },
    annotations: read,
  }, async (args) => result(await rest('GET', `/api/v1/transactions${query(args)}`)))

  server.registerTool('edit_transaction', {
    title: 'Edit a transaction',
    description: 'Change one of the user\'s purchases after they confirmed the change, e.g. "I returned the shoes, it was $18". Edited fields win over later receipts and statements. line_items replaces all explicit line items.',
    inputSchema: { id, ...transactionFields, amount: amount.optional() },
    annotations: write,
  }, async ({ id, ...patch }) => result(await rest('PATCH', `/api/v1/transactions/${id}`, patch)))

  server.registerTool('delete_transaction', {
    title: 'Delete a transaction',
    description: 'Delete one of the user\'s purchases, after they confirmed.',
    inputSchema: { id },
    annotations: destroy,
  }, async ({ id }) => result(await rest('DELETE', `/api/v1/transactions/${id}`)))

  server.registerTool('add_source', {
    title: 'Add a source',
    description: 'Attach what you read from a receipt, bill, email or statement to a purchase already logged, e.g. a receipt sent later. Send the receipt\'s line_items (grouped) and checked_groups; the response lists what changed.',
    inputSchema: { id, kind: sourceKind, ...transactionFields, amount: amount.optional(), extracted: z.record(z.string(), z.unknown()).optional() },
    annotations: write,
  }, async ({ id, ...body }) => result(await rest('POST', `/api/v1/transactions/${id}/sources`, body)))

  server.registerTool('merge_transactions', {
    title: 'Merge two transactions',
    description: 'After the user agreed two logged purchases are the same one: merges other_id into id, keeping both sets of sources, and deletes other_id.',
    inputSchema: { id, other_id: id },
    annotations: destroy,
  }, async ({ id, other_id }) => result(await rest('POST', `/api/v1/transactions/${id}/merge`, { other_id })))

  server.registerTool('list_cost_centers', {
    title: 'List people & things',
    description: 'The people and things the household spends for ("cost centers" in the API), each with its kind: Car, Home, Child, Pet. get_playbook already returns them.',
    annotations: read,
  }, async () => result(await rest('GET', '/api/v1/cost-centers')))

  server.registerTool('add_cost_center', {
    title: 'Add a person or thing',
    description: 'Add a car, home, child, pet or anything else the household tracks spending for. Only after the user said yes to adding this name as new, asked on its own: a name that isn\'t in list_cost_centers is often a typo for one that is.',
    inputSchema: { name: z.string(), kind: z.string().describe('Car, Home, Child, Pet, …') },
    annotations: write,
  }, async (args) => result(await rest('POST', '/api/v1/cost-centers', args)))

  server.registerTool('add_category', {
    title: 'Add a category',
    description: 'Add a category or subcategory ("Groceries/Alcohol") only after the user agreed to the name and nothing existing fits. A subcategory\'s parent must exist.',
    inputSchema: { path: z.string() },
    annotations: write,
  }, async (args) => result(await rest('POST', '/api/v1/categories', args)))

  server.registerTool('rename_category', {
    title: 'Rename a category',
    description: 'Fix a category\'s name or move it under another parent ("Gas" to "Car/Fuel"), after the user said yes to that change on its own. Purchases, watched groups and repeats keep it; subcategories move with it.',
    inputSchema: { path: z.string(), new_path: z.string() },
    annotations: write,
  }, async (args) => result(await rest('PATCH', '/api/v1/categories', args)))

  server.registerTool('delete_category', {
    title: 'Delete a category',
    description: 'Delete a category nothing uses, after the user said yes. If purchases, subcategories, watched groups or repeats still use it, Kept refuses and says which: offer to move them (edit_transaction, rename_category) or to rename instead.',
    inputSchema: { path: z.string() },
    annotations: destroy,
  }, async ({ path }) => result(await rest('DELETE', `/api/v1/categories${query({ path })}`)))

  server.registerTool('rename_cost_center', {
    title: 'Rename a person or thing',
    description: 'Fix the name of a person or thing ("Iva" to "Ivy"), after the user said yes to that change on its own. Purchases and repeats keep it.',
    inputSchema: { name: z.string(), new_name: z.string() },
    annotations: write,
  }, async (args) => result(await rest('PATCH', '/api/v1/cost-centers', args)))

  server.registerTool('delete_cost_center', {
    title: 'Delete a person or thing',
    description: 'Delete a person or thing nothing uses, after the user said yes. If purchases or repeats still use it, Kept refuses and says which: offer to move them with edit_transaction, or to rename instead.',
    inputSchema: { name: z.string() },
    annotations: destroy,
  }, async ({ name }) => result(await rest('DELETE', `/api/v1/cost-centers${query({ name })}`)))

  server.registerTool('watch_group', {
    title: 'Watch a group',
    description: 'Start asking about a group where it\'s bought, after the user asked ("keep an eye on alcohol", "track snacks"): a category, which may need add_category first, or an item bought across categories.',
    inputSchema: { category: z.string().nullish(), item: z.string().nullish() },
    annotations: write,
  }, async (args) => result(await rest('POST', '/api/v1/watches', args)))

  server.registerTool('stop_watching', {
    title: 'Stop watching a group',
    description: 'Stop asking about a watched group ("stop tracking snacks"), by the id from get_playbook\'s watching. Past purchases don\'t change.',
    inputSchema: { id },
    annotations: destroy,
  }, async ({ id }) => result(await rest('DELETE', `/api/v1/watches/${id}`)))

  server.registerTool('save_note', {
    title: 'Save a note',
    description: 'Remember something about the user\'s spending, in their words, after telling them what you\'ll remember: a habit ("Costco is always groceries"), a split, a store that\'s always private, or a plan. Write any time as a date ("We\'re selling the Kia in December 2026"), never "next month". Never save silently.',
    inputSchema: { text: z.string() },
    annotations: write,
  }, async (args) => result(await rest('POST', '/api/v1/notes', args)))

  server.registerTool('update_note', {
    title: 'Update a note',
    description: 'Change a note\'s text, after the user agreed.',
    inputSchema: { id, text: z.string() },
    annotations: write,
  }, async ({ id, ...body }) => result(await rest('PATCH', `/api/v1/notes/${id}`, body)))

  server.registerTool('delete_note', {
    title: 'Delete a note',
    description: 'Forget a note, after the user asked.',
    inputSchema: { id },
    annotations: destroy,
  }, async ({ id }) => result(await rest('DELETE', `/api/v1/notes/${id}`)))

  server.registerTool('set_repeat', {
    title: 'Repeat a transaction',
    description: 'Make a logged purchase repeat, after the user confirmed the schedule ("repeat it on the 27th of every month?"). The ledger then logs it on each date and you announce it via get_updates.',
    inputSchema: {
      transaction_id: id, frequency: z.enum(['weekly', 'monthly', 'yearly']), interval: z.number().int().min(1).optional().describe('2 with weekly = every two weeks.'),
      anchor: date.optional().describe('Sets the weekday, day of month or date. Defaults to the purchase date.'), ends_on: date.nullish(), remaining: z.number().int().min(0).nullish(),
    },
    annotations: write,
  }, async (args) => result(await rest('POST', '/api/v1/repeats', args)))

  server.registerTool('list_repeats', {
    title: 'List repeats',
    description: 'The user\'s repeats with their next date and amount.',
    annotations: read,
  }, async () => result(await rest('GET', '/api/v1/repeats')))

  server.registerTool('update_repeat', {
    title: 'Change a repeat',
    description: 'Change a repeat from its next date ("the phone is $55 from now on", "rent moves to the 1st"), or pause and resume it.',
    inputSchema: {
      id, amount: amount.optional(), frequency: z.enum(['weekly', 'monthly', 'yearly']).optional(), interval: z.number().int().min(1).optional(),
      anchor: date.optional(), ends_on: date.nullish(), remaining: z.number().int().min(0).nullish(), paused: z.boolean().optional(),
    },
    annotations: write,
  }, async ({ id, ...body }) => result(await rest('PATCH', `/api/v1/repeats/${id}`, body)))

  server.registerTool('stop_repeat', {
    title: 'Stop a repeat',
    description: 'Stop repeating. Purchases already logged stay.',
    inputSchema: { id },
    annotations: destroy,
  }, async ({ id }) => result(await rest('DELETE', `/api/v1/repeats/${id}`)))

  server.registerTool('get_summary', {
    title: 'Get a spending summary',
    description: 'Totals by category, person or thing (group_by cost_center) or item, per month, year or in total. scope "me" (default) is the user\'s own spending, private included; "household" is every member\'s non-private spending, never by member. Watched groups come with checked_share and estimate: say how reliable the total is.',
    inputSchema: {
      from: date.optional(), to: date.optional(), group_by: z.enum(['category', 'cost_center', 'item']).optional(),
      period: z.enum(['month', 'year', 'total']).optional(), scope: z.enum(['me', 'household']).optional(),
    },
    annotations: read,
  }, async (args) => result(await rest('GET', `/api/v1/expenses/summary${query(args)}`)))

  server.registerTool('update_setup', {
    title: 'Update setup',
    description: 'Save confirmed first-conversation answers: currency (owner, before the first purchase), the user\'s time zone, step states (basics, cost_centers, categories, watch, invite: done or later), and introduced: true once you introduced Kept.',
    inputSchema: {
      name: z.string().optional(), currency: z.string().length(3).optional(), timezone: z.string().optional(),
      steps: z.record(z.string(), z.enum(['pending', 'done', 'later'])).optional(), introduced: z.literal(true).optional(),
    },
    annotations: write,
  }, async (args) => result(await rest('PATCH', '/api/v1/setup', args)))

  server.registerTool('invite_member', {
    title: 'Invite a member',
    description: 'Invite someone in the household by email, after the user confirmed. Kept emails them a sign-in link. Owners only.',
    inputSchema: { email: z.string().email() },
    annotations: { ...write, openWorldHint: true },
  }, async (args) => result(await rest('POST', '/api/v1/invites', args)))
}