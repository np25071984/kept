import type { Tx } from '../db/db.js'
import { groupsWithLines } from '../domain/coverage.js'
import { addDays, dateWarning, isLocalDate, todayIn } from '../domain/dates.js'
import { buildLines, resizeLines, validateShares, type Line, type SpentFor } from '../domain/lines.js'
import { decideMatch, reconcile, type FieldChange, type KeptField, type MatchCandidate, type SourceKind } from '../domain/matching.js'
import { centsToNumeric, formatAmount, fromCents, numericToCents, toCents } from '../domain/money.js'
import { capNotes, listCaps } from './caps.js'
import type { Caller } from './caller.js'
import { invalid, notFound, unwrap } from './errors.js'
import { loadVocabulary, type Vocabulary } from './vocabulary.js'
import { watchedGroups } from './watches.js'

export interface SpentForBody {
  cost_center: string
  share?: number | null
}

export interface LineBody {
  amount: number
  category: string
  item?: string | null
  notes?: string | null
  spent_for?: SpentForBody[]
}

export interface SourceBody {
  kind?: SourceKind
  extracted?: Record<string, unknown>
}

export interface TransactionBody {
  date?: string
  occurred_at?: string
  timezone?: string
  amount: number
  merchant?: string | null
  notes?: string | null
  private?: boolean
  category?: string | null
  spent_for?: SpentForBody[]
  line_items?: LineBody[]
  checked_groups?: string[]
  source?: SourceBody
}

export interface LineView {
  amount: number
  category: string
  item: string | null
  notes: string | null
  rest: boolean
  spent_for: { cost_center: string; share: number | null }[]
}

export interface TransactionView {
  id: string
  date: string
  occurred_at: string | null
  timezone: string
  amount: number
  merchant: string | null
  notes: string | null
  private: boolean
  category: string | null
  repeat_id: string | null
  checked_groups: string[]
  line_items: LineView[]
  sources: { id: string; kind: string; received_at: string; extracted: Record<string, unknown> | null }[]
}

export interface WriteResult {
  result: 'created' | 'attached' | 'possible_duplicate'
  transaction: TransactionView
  possible_duplicate_of?: string
  changes?: FieldChange[]
  kept?: KeptField[]
  warnings?: string[]
  // Caps this write took past 80% or over, as lines to say in the confirmation (VISION.md §4.A, "Caps").
  caps?: string[]
}

// Every write is matched against the caller's own transactions first (VISION.md §3.4, "One purchase, many sources").
export async function createTransactions(tx: Tx, caller: Caller, bodies: TransactionBody[], now = new Date()): Promise<WriteResult[]> {
  const results: WriteResult[] = []
  const capsBefore = await listCaps(tx, caller, now)
  for (const body of bodies) {
    const result = await createOne(tx, caller, body, now)
    const warning = body.date ? dateWarning(body.date, todayIn(caller.timezone, now), (body.source?.kind ?? 'talk') === 'talk') : null
    results.push(warning ? { ...result, warnings: [warning] } : result)
  }
  if (capsBefore.length && results.length) {
    const after = await listCaps(tx, caller, now)
    const added = new Map(after.map((c) => [c.id, toCents(c.spent) - toCents(capsBefore.find((b) => b.id === c.id)?.spent ?? 0)]))
    const notes = capNotes(after, added, caller.currency)
    if (notes.length) results[results.length - 1] = { ...results[results.length - 1]!, caps: notes }
  }
  return results
}

interface Prepared {
  kind: SourceKind
  date: string
  timezone: string
  occurred_at: string | null
  amount: number
  merchant: string | null
  notes: string | null
  private: boolean
  main_category: string | null
  lines: Line[]
  checked_groups: string[]
  extracted: Record<string, unknown>
}

async function prepare(tx: Tx, caller: Caller, body: TransactionBody, vocabulary: Vocabulary, now: Date): Promise<Prepared> {
  const timezone = body.timezone ?? caller.timezone
  const occurredAt = body.occurred_at ? new Date(body.occurred_at) : null
  if (occurredAt && Number.isNaN(occurredAt.getTime())) throw invalid('invalid_occurred_at', 'occurred_at must be an ISO timestamp.')
  let date: string
  try {
    date = body.date ?? todayIn(timezone, occurredAt ?? now)
  } catch {
    throw invalid('invalid_timezone', `"${timezone}" is not an IANA time zone name.`)
  }
  if (!isLocalDate(date)) throw invalid('invalid_date', 'date must be YYYY-MM-DD.')

  const amount = toCents(body.amount)
  const lines = unwrap(
    buildLines({
      amount,
      category: body.category ?? null,
      spent_for: body.spent_for,
      line_items: body.line_items?.map((line) => ({ ...line, amount: toCents(line.amount) })),
    }),
  )
  for (const line of lines) {
    line.category = vocabulary.categoryPath(vocabulary.categoryId(line.category))
    line.spent_for = (line.spent_for ?? []).map((entry) => ({ ...entry, cost_center: vocabulary.costCenterName(vocabulary.costCenterId(entry.cost_center)) }))
  }
  const mainCategory = body.category ? vocabulary.categoryPath(vocabulary.categoryId(body.category)) : null

  const watched = await watchedGroups(tx, caller)
  const checked = [...new Set([...(body.checked_groups ?? []).map((g) => g.trim()), ...groupsWithLines(watched, lines)])]
  const kind = body.source?.kind ?? 'talk'
  return {
    kind,
    date,
    timezone,
    occurred_at: occurredAt?.toISOString() ?? null,
    amount,
    merchant: body.merchant?.trim() || null,
    notes: body.notes ?? null,
    private: body.private ?? false,
    main_category: mainCategory,
    lines,
    checked_groups: checked,
    extracted: { amount: fromCents(amount), date, merchant: body.merchant ?? null, ...body.source?.extracted },
  }
}

async function createOne(tx: Tx, caller: Caller, body: TransactionBody, now: Date): Promise<WriteResult> {
  const vocabulary = await loadVocabulary(tx)
  const incoming = await prepare(tx, caller, body, vocabulary, now)
  const candidates = await loadCandidates(tx, caller, incoming.date)
  const decision = decideMatch(candidates, { kind: incoming.kind, date: incoming.date, amount: incoming.amount, merchant: incoming.merchant })

  if (decision.kind === 'attach') {
    const merged = await applySource(tx, caller, vocabulary, decision.id, incoming)
    return { result: 'attached', transaction: await getTransaction(tx, caller, decision.id), changes: merged.changes, kept: merged.kept }
  }

  const id = await insertTransaction(tx, caller, vocabulary, incoming, null)
  if (decision.kind === 'possible_duplicate') {
    const other = await getTransaction(tx, caller, decision.id)
    const text = `Is the ${formatAmount(incoming.amount, caller.currency)}${incoming.merchant ? ` at ${incoming.merchant}` : ''} on ${incoming.date} the ${formatAmount(toCents(other.amount), caller.currency)}${other.merchant ? ` at ${other.merchant}` : ''} logged on ${other.date}?`
    await tx.insertInto('updates').values({ household_id: caller.household_id, user_id: caller.user_id, kind: 'possible_duplicate', text, transaction_id: id, other_transaction_id: decision.id }).execute()
    return { result: 'possible_duplicate', transaction: await getTransaction(tx, caller, id), possible_duplicate_of: decision.id }
  }
  return { result: 'created', transaction: await getTransaction(tx, caller, id) }
}

export async function insertTransaction(tx: Tx, caller: Caller, vocabulary: Vocabulary, input: Omit<Prepared, 'kind' | 'extracted'> & Partial<Pick<Prepared, 'kind' | 'extracted'>>, repeatId: string | null): Promise<string> {
  const { id } = await tx
    .insertInto('transactions')
    .values({
      household_id: caller.household_id,
      spent_by: caller.user_id,
      date: input.date,
      occurred_at: input.occurred_at,
      timezone: input.timezone,
      amount: centsToNumeric(input.amount),
      private: input.private,
      merchant: input.merchant,
      notes: input.notes,
      main_category_id: input.main_category ? vocabulary.categoryId(input.main_category) : null,
      repeat_id: repeatId,
      checked_groups: input.checked_groups,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await writeLines(tx, caller, vocabulary, id, input.lines)
  if (input.kind) {
    await tx.insertInto('sources').values({ household_id: caller.household_id, transaction_id: id, user_id: caller.user_id, kind: input.kind, extracted: JSON.stringify(input.extracted ?? {}) }).execute()
  }
  return id
}

async function writeLines(tx: Tx, caller: Caller, vocabulary: Vocabulary, transactionId: string, lines: Line[]) {
  await tx.deleteFrom('line_items').where('transaction_id', '=', transactionId).execute()
  for (const [position, line] of lines.entries()) {
    const { id } = await tx
      .insertInto('line_items')
      .values({
        household_id: caller.household_id,
        transaction_id: transactionId,
        position,
        amount: centsToNumeric(line.amount),
        category_id: vocabulary.categoryId(line.category),
        item: line.item?.trim() || null,
        notes: line.notes ?? null,
        is_rest: line.is_rest,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const spentFor = line.spent_for ?? []
    if (spentFor.length > 0) {
      await tx
        .insertInto('line_item_cost_centers')
        .values(spentFor.map((entry) => ({ household_id: caller.household_id, line_item_id: id, cost_center_id: vocabulary.costCenterId(entry.cost_center), share: entry.share ?? null })))
        .execute()
    }
  }
}

async function loadCandidates(tx: Tx, caller: Caller, date: string): Promise<MatchCandidate[]> {
  const rows = await tx
    .selectFrom('transactions')
    .select(['id', 'date', 'amount', 'merchant', 'repeat_id'])
    .where('spent_by', '=', caller.user_id)
    .where('date', '>=', addDays(date, -7))
    .where('date', '<=', addDays(date, 7))
    .execute()
  if (rows.length === 0) return []
  const sources = await tx.selectFrom('sources').select(['transaction_id', 'kind', 'extracted']).where('transaction_id', 'in', rows.map((r) => r.id)).execute()
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    amount: numericToCents(row.amount),
    merchant: row.merchant,
    repeated: row.repeat_id != null,
    sources: sources
      .filter((s) => s.transaction_id === row.id)
      .map((s) => ({ kind: s.kind as SourceKind, amount: typeof s.extracted?.amount === 'number' ? toCents(s.extracted.amount) : null })),
  }))
}

// Reconciles a new source into an existing transaction and saves the result.
async function applySource(tx: Tx, caller: Caller, vocabulary: Vocabulary, id: string, incoming: Prepared) {
  const existing = await loadRaw(tx, caller, id)
  const merged = reconcile(existing, {
    kind: incoming.kind,
    amount: incoming.amount,
    date: incoming.date,
    merchant: incoming.merchant,
    lines: incoming.lines,
    checked_groups: incoming.checked_groups,
    private: incoming.private,
  })
  await tx
    .updateTable('transactions')
    .set({
      amount: centsToNumeric(merged.amount),
      date: merged.date,
      merchant: merged.merchant,
      private: merged.private,
      checked_groups: merged.checked_groups,
      occurred_at: existing.occurred_at ?? incoming.occurred_at,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .execute()
  if (merged.lines !== existing.lines) await writeLines(tx, caller, vocabulary, id, merged.lines)
  await tx.insertInto('sources').values({ household_id: caller.household_id, transaction_id: id, user_id: caller.user_id, kind: incoming.kind, extracted: JSON.stringify(incoming.extracted) }).execute()
  if (existing.repeat_id && merged.amount !== existing.amount) await setRepeatAmount(tx, existing.repeat_id, merged.amount, merged.lines)
  return merged
}

// A repeat always uses the most recent real amount (VISION.md §3.5).
export async function setRepeatAmount(tx: Tx, repeatId: string, amount: number, lines: Line[]) {
  const repeat = await tx.selectFrom('repeats').select('template').where('id', '=', repeatId).executeTakeFirst()
  if (!repeat) return
  const template = { ...repeat.template, amount: fromCents(amount), line_items: lines.map((line) => ({ ...line, amount: fromCents(line.amount) })) }
  await tx.updateTable('repeats').set({ template: JSON.stringify(template) }).where('id', '=', repeatId).execute()
}

interface Raw {
  id: string
  amount: number
  date: string
  occurred_at: string | null
  merchant: string | null
  main_category: string | null
  lines: Line[]
  checked_groups: string[]
  private: boolean
  user_edited: string[]
  source_kinds: SourceKind[]
  repeat_id: string | null
}

async function loadRaw(tx: Tx, caller: Caller, id: string): Promise<Raw> {
  const [view] = await loadViews(tx, caller, [id])
  if (!view) throw notFound('Transaction')
  const row = await tx.selectFrom('transactions').select('user_edited').where('id', '=', id).executeTakeFirstOrThrow()
  return {
    id,
    amount: toCents(view.amount),
    date: view.date,
    occurred_at: view.occurred_at,
    merchant: view.merchant,
    main_category: view.category,
    lines: view.line_items.map(toLine),
    checked_groups: view.checked_groups,
    private: view.private,
    user_edited: row.user_edited,
    source_kinds: [...new Set(view.sources.map((s) => s.kind as SourceKind))],
    repeat_id: view.repeat_id,
  }
}

function toLine(view: LineView): Line {
  return {
    amount: toCents(view.amount),
    category: view.category,
    item: view.item,
    notes: view.notes,
    spent_for: view.spent_for.map((s) => ({ cost_center: s.cost_center, share: s.share })),
    is_rest: view.rest,
  }
}

export async function getTransaction(tx: Tx, caller: Caller, id: string): Promise<TransactionView> {
  const [view] = await loadViews(tx, caller, [id])
  if (!view) throw notFound('Transaction')
  return view
}

// Only the caller's own transactions, whatever the household (VISION.md §4.A, "Households, Accounts and Privacy").
export async function loadViews(tx: Tx, caller: Caller, ids: string[]): Promise<TransactionView[]> {
  if (ids.length === 0) return []
  const rows = await tx
    .selectFrom('transactions')
    .leftJoin('categories', 'categories.id', 'transactions.main_category_id')
    .select([
      'transactions.id', 'transactions.date', 'transactions.occurred_at', 'transactions.timezone', 'transactions.amount', 'transactions.merchant',
      'transactions.notes', 'transactions.private', 'transactions.repeat_id', 'transactions.checked_groups', 'categories.path as category',
    ])
    .where('transactions.id', 'in', ids)
    .where('transactions.spent_by', '=', caller.user_id)
    .execute()
  if (rows.length === 0) return []
  const found = rows.map((r) => r.id)
  const lines = await tx
    .selectFrom('line_items')
    .innerJoin('categories', 'categories.id', 'line_items.category_id')
    .select(['line_items.id', 'line_items.transaction_id', 'line_items.amount', 'line_items.item', 'line_items.notes', 'line_items.is_rest', 'line_items.position', 'categories.path'])
    .where('line_items.transaction_id', 'in', found)
    .orderBy('line_items.position')
    .execute()
  const spentFor = lines.length === 0 ? [] : await tx
    .selectFrom('line_item_cost_centers')
    .innerJoin('cost_centers', 'cost_centers.id', 'line_item_cost_centers.cost_center_id')
    .select(['line_item_cost_centers.line_item_id', 'cost_centers.name', 'line_item_cost_centers.share'])
    .where('line_item_cost_centers.line_item_id', 'in', lines.map((l) => l.id))
    .execute()
  const sources = await tx.selectFrom('sources').select(['id', 'transaction_id', 'kind', 'received_at', 'extracted']).where('transaction_id', 'in', found).orderBy('received_at').execute()
  const order = new Map(ids.map((id, index) => [id, index]))
  return rows
    .map((row) => ({
      id: row.id,
      date: row.date,
      occurred_at: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
      timezone: row.timezone,
      amount: Number(row.amount),
      merchant: row.merchant,
      notes: row.notes,
      private: row.private,
      category: row.category,
      repeat_id: row.repeat_id,
      checked_groups: row.checked_groups,
      line_items: lines
        .filter((l) => l.transaction_id === row.id)
        .map((l) => ({
          amount: Number(l.amount),
          category: l.path,
          item: l.item,
          notes: l.notes,
          rest: l.is_rest,
          spent_for: spentFor.filter((s) => s.line_item_id === l.id).map((s) => ({ cost_center: s.name, share: s.share == null ? null : Number(s.share) })),
        })),
      sources: sources
        .filter((s) => s.transaction_id === row.id)
        .map((s) => ({ id: s.id, kind: s.kind, received_at: new Date(s.received_at).toISOString(), extracted: s.extracted })),
    }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export interface TransactionPatch {
  date?: string
  occurred_at?: string | null
  timezone?: string
  amount?: number
  merchant?: string | null
  notes?: string | null
  private?: boolean
  category?: string | null
  spent_for?: SpentForBody[]
  line_items?: LineBody[]
  checked_groups?: string[]
}

// The user's own edits are recorded, so a later source can't undo them (VISION.md §3.4, "The user's own edits win").
export async function patchTransaction(tx: Tx, caller: Caller, id: string, patch: TransactionPatch): Promise<TransactionView> {
  const existing = await loadRaw(tx, caller, id)
  const vocabulary = await loadVocabulary(tx)
  const edited = new Set(existing.user_edited)
  const amount = patch.amount !== undefined ? toCents(patch.amount) : existing.amount
  let lines = existing.lines
  let mainCategory = existing.main_category

  if (patch.line_items !== undefined || patch.category !== undefined || patch.spent_for !== undefined) {
    const rest = existing.lines.find((line) => line.is_rest)
    mainCategory = patch.category !== undefined ? (patch.category ? vocabulary.categoryPath(vocabulary.categoryId(patch.category)) : null) : mainCategory
    lines = unwrap(
      buildLines({
        amount,
        category: mainCategory ?? rest?.category ?? null,
        spent_for: patch.spent_for ?? rest?.spent_for ?? [],
        line_items: patch.line_items ? patch.line_items.map((l) => ({ ...l, amount: toCents(l.amount) })) : existing.lines.filter((l) => !l.is_rest),
      }),
    )
    edited.add('line_items')
  } else if (amount !== existing.amount) {
    lines = unwrap(resizeLines(existing.lines, amount, mainCategory))
  }
  for (const line of lines) {
    line.category = vocabulary.categoryPath(vocabulary.categoryId(line.category))
    for (const entry of line.spent_for ?? []) entry.cost_center = vocabulary.costCenterName(vocabulary.costCenterId(entry.cost_center))
  }
  if (amount !== existing.amount) edited.add('amount')
  if (patch.date !== undefined) {
    if (!isLocalDate(patch.date)) throw invalid('invalid_date', 'date must be YYYY-MM-DD.')
    edited.add('date')
  }
  if (patch.merchant !== undefined) edited.add('merchant')

  await tx
    .updateTable('transactions')
    .set({
      amount: centsToNumeric(amount),
      main_category_id: mainCategory ? vocabulary.categoryId(mainCategory) : null,
      user_edited: [...edited],
      updated_at: new Date(),
      ...(patch.date !== undefined && { date: patch.date }),
      ...(patch.occurred_at !== undefined && { occurred_at: patch.occurred_at }),
      ...(patch.timezone !== undefined && { timezone: patch.timezone }),
      ...(patch.merchant !== undefined && { merchant: patch.merchant?.trim() || null }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.private !== undefined && { private: patch.private }),
      ...(patch.checked_groups !== undefined && { checked_groups: patch.checked_groups }),
    })
    .where('id', '=', id)
    .execute()
  if (lines !== existing.lines) await writeLines(tx, caller, vocabulary, id, lines)
  if (existing.repeat_id && amount !== existing.amount) await setRepeatAmount(tx, existing.repeat_id, amount, lines)
  return getTransaction(tx, caller, id)
}

export async function deleteTransaction(tx: Tx, caller: Caller, id: string): Promise<void> {
  const deleted = await tx.deleteFrom('transactions').where('id', '=', id).where('spent_by', '=', caller.user_id).returning('id').executeTakeFirst()
  if (!deleted) throw notFound('Transaction')
}

export interface SourcePatchBody extends Partial<Omit<TransactionBody, 'source'>> {
  kind: SourceKind
  extracted?: Record<string, unknown>
}

// A source added later, such as a receipt read after the purchase was logged.
export async function addSource(tx: Tx, caller: Caller, id: string, body: SourcePatchBody): Promise<WriteResult> {
  const existing = await getTransaction(tx, caller, id)
  const vocabulary = await loadVocabulary(tx)
  const hasLines = body.line_items !== undefined || body.category !== undefined || body.spent_for !== undefined
  const incoming = await prepare(
    tx,
    caller,
    {
      ...body,
      amount: body.amount ?? existing.amount,
      date: body.date ?? existing.date,
      timezone: body.timezone ?? existing.timezone,
      merchant: body.merchant ?? existing.merchant,
      category: body.category ?? existing.category ?? existing.line_items.find((l) => l.rest)?.category ?? null,
      source: { kind: body.kind, extracted: body.extracted },
    },
    vocabulary,
    new Date(),
  )
  if (!hasLines) incoming.lines = []
  const merged = await applySource(tx, caller, vocabulary, id, incoming)
  return { result: 'attached', transaction: await getTransaction(tx, caller, id), changes: merged.changes, kept: merged.kept }
}

// Two transactions the user agreed are one purchase: the other one's sources move over and are reconciled like new ones.
export async function mergeTransactions(tx: Tx, caller: Caller, id: string, otherId: string): Promise<WriteResult> {
  if (id === otherId) throw invalid('same_transaction', 'A transaction cannot be merged into itself.')
  await getTransaction(tx, caller, id)
  const other = await loadRaw(tx, caller, otherId)
  const otherView = await getTransaction(tx, caller, otherId)
  const vocabulary = await loadVocabulary(tx)
  const changes: FieldChange[] = []
  const kept: KeptField[] = []
  for (const source of otherView.sources) {
    const merged = await applySource(tx, caller, vocabulary, id, {
      kind: source.kind as SourceKind,
      date: other.date,
      timezone: otherView.timezone,
      occurred_at: other.occurred_at,
      amount: other.amount,
      merchant: other.merchant,
      notes: null,
      private: other.private,
      main_category: other.main_category,
      lines: other.lines,
      checked_groups: other.checked_groups,
      extracted: source.extracted ?? {},
    })
    changes.push(...merged.changes)
    kept.push(...merged.kept)
  }
  if (other.repeat_id) await tx.updateTable('transactions').set({ repeat_id: other.repeat_id }).where('id', '=', id).where('repeat_id', 'is', null).execute()
  await tx.deleteFrom('transactions').where('id', '=', otherId).execute()
  return { result: 'attached', transaction: await getTransaction(tx, caller, id), changes, kept }
}

export function spentForBody(entries: SpentFor[] | undefined): SpentForBody[] {
  return unwrap(validateShares(entries ?? [])).map((e) => ({ cost_center: e.cost_center, share: e.share ?? null }))
}