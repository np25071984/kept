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
  cost_center: z.string().describe('An existing cost center name.'),
  share: z.number().gt(0).lte(1).nullish().describe('Fraction of the line. Omit to split the remainder evenly.'),
}))
const lineItem = z.object({
  amount,
  category: z.string().describe('An existing category path, e.g. "Car/Fuel".'),
  item: z.string().nullish().describe('Free text to track, e.g. "nuts", "shoes".'),
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
  spent_for: spentFor.optional().describe('Cost centers for the main category.'),
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

// The playbook, the household's vocabulary and what to do first, in one call.
export async function playbook(rest: Rest, now = new Date()) {
  const [setup, categories, costCenters, rules] = await Promise.all([
    rest('GET', '/api/v1/setup'),
    rest('GET', '/api/v1/categories'),
    rest('GET', '/api/v1/cost-centers'),
    rest('GET', '/api/v1/rules'),
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
    rules: (rules.body as { rules: unknown[] }).rules,
    playbook: PLAYBOOK,
  }
}

export function registerTools(server: McpServer, rest: Rest) {
  server.registerTool('get_playbook', {
    title: 'Get the playbook',
    description: 'Call this first in every conversation, before asking the user anything about money. Returns how to ask about and log expenses (follow it), what to do first (start_with: the first conversation when setup is unfinished), today\'s date, and the household\'s categories, cost centers and rules.',
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
    title: 'List cost centers',
    description: 'The household\'s cost centers (cars, homes, kids, pets), or those for a category. Ask which one only when there is more than one.',
    inputSchema: { category: z.string().optional() },
    annotations: read,
  }, async (args) => result(await rest('GET', `/api/v1/cost-centers${query(args)}`)))

  server.registerTool('add_cost_center', {
    title: 'Add a cost center',
    description: 'Add a car, home, child, pet or anything else the household tracks spending against. Only after the user said yes to adding this name as new, asked on its own: a name that isn\'t in list_cost_centers is often a typo for one that is. Link it to the categories it applies to.',
    inputSchema: { name: z.string(), kind: z.string().describe('Car, Home, Child, Pet, …'), categories: z.array(z.string()).optional() },
    annotations: write,
  }, async (args) => result(await rest('POST', '/api/v1/cost-centers', args)))

  server.registerTool('add_category', {
    title: 'Add a category',
    description: 'Add a category or subcategory ("Groceries/Alcohol") only after the user agreed to the name and nothing existing fits. A subcategory\'s parent must exist.',
    inputSchema: { path: z.string() },
    annotations: write,
  }, async (args) => result(await rest('POST', '/api/v1/categories', args)))

  server.registerTool('get_rules', {
    title: 'Get rules',
    description: 'Rules for this merchant, category or bill account, and the one that wins for each kind. Apply them before guessing from history.',
    inputSchema: { merchant: z.string().optional(), category: z.string().optional(), account_ref: z.string().optional() },
    annotations: read,
  }, async (args) => result(await rest('GET', `/api/v1/rules${query(args)}`)))

  server.registerTool('save_rule', {
    title: 'Save a rule',
    description: 'Save a rule the user agreed to, in their words. Kinds: watch (params.category or params.item), ask_breakdown, set_category (params.category), set_spent_for (params.spent_for), set_private (always personal). Never save silently.',
    inputSchema: {
      kind: z.enum(['watch', 'ask_breakdown', 'set_category', 'set_spent_for', 'set_private']),
      merchant: z.string().nullish(), category: z.string().nullish().describe('Condition: applies within this category.'),
      account_ref: z.string().nullish().describe('Condition: the account number on a bill.'),
      params: z.record(z.string(), z.unknown()).optional(), text: z.string().describe('The rule in the user\'s words.'),
      personal: z.boolean().optional().describe('Applies to this user only.'),
    },
    annotations: write,
  }, async (args) => result(await rest('POST', '/api/v1/rules', args)))

  server.registerTool('delete_rule', {
    title: 'Delete a rule',
    description: 'Remove a rule, e.g. "stop tracking nuts". Past purchases don\'t change.',
    inputSchema: { id },
    annotations: destroy,
  }, async ({ id }) => result(await rest('DELETE', `/api/v1/rules/${id}`)))

  server.registerTool('get_notes', {
    title: 'Get notes',
    description: 'What the household told you about a cost center, category or merchant ("we\'re selling the Kia in December"). Load notes for what the conversation touches before guessing.',
    inputSchema: { cost_center: z.string().optional(), category: z.string().optional(), merchant: z.string().optional(), q: z.string().optional(), include_expired: z.boolean().optional() },
    annotations: read,
  }, async (args) => result(await rest('GET', `/api/v1/notes${query(args)}`)))

  server.registerTool('save_note', {
    title: 'Save a note',
    description: 'Remember context that affects how expenses are asked about or filed, after telling the user. Link it to at least one cost center, category or merchant; give plans an expires_on.',
    inputSchema: {
      text: z.string(), personal: z.boolean().optional(), cost_centers: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(), merchants: z.array(z.string()).optional(), expires_on: date.nullish(),
    },
    annotations: write,
  }, async (args) => result(await rest('POST', '/api/v1/notes', args)))

  server.registerTool('update_note', {
    title: 'Update a note',
    description: 'Change a note\'s text, links or expiry.',
    inputSchema: { id, text: z.string().optional(), cost_centers: z.array(z.string()).optional(), categories: z.array(z.string()).optional(), merchants: z.array(z.string()).optional(), expires_on: date.nullish() },
    annotations: write,
  }, async ({ id, ...body }) => result(await rest('PATCH', `/api/v1/notes/${id}`, body)))

  server.registerTool('delete_note', {
    title: 'Delete a note',
    description: 'Forget a note.',
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
    description: 'Totals by category, cost center or item, per month, year or in total. scope "me" (default) is the user\'s own spending, private included; "household" is every member\'s non-private spending, never by member. Watched groups come with checked_share and estimate: say how reliable the total is.',
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