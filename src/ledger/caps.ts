import type { z } from 'zod'
import type * as api from '../api/ledger.js'
import type { Tx } from '../db/db.js'
import { capRange, capState, type CapPeriod, type CapState } from '../domain/caps.js'
import { todayIn } from '../domain/dates.js'
import { fromCents, numericToCents, toCents } from '../domain/money.js'
import type { Caller } from './caller.js'
import { invalid, notFound } from './errors.js'
import { getSummary } from './summary.js'
import { loadVocabulary } from './vocabulary.js'

// The caller's caps (VISION.md §4.A, "Caps"): soft reminders on a category or one of the people & things. Nobody else sees them.

export interface CapView {
  id: string
  category: string | null
  cost_center: string | null
  amount: number
  period: CapPeriod
  spent: number
  state: CapState
}

interface Row { id: string; category: string | null; cost_center: string | null; amount: number; period: CapPeriod }

async function loadRows(tx: Tx, caller: Caller): Promise<Row[]> {
  const rows = await tx
    .selectFrom('caps')
    .leftJoin('categories', 'categories.id', 'caps.category_id')
    .leftJoin('cost_centers', 'cost_centers.id', 'caps.cost_center_id')
    .select(['caps.id', 'categories.path', 'cost_centers.name', 'caps.amount', 'caps.period'])
    .where('caps.user_id', '=', caller.user_id)
    .orderBy('caps.created_at')
    .execute()
  return rows.map((r) => ({ id: r.id, category: r.path ?? null, cost_center: r.name ?? null, amount: numericToCents(r.amount), period: r.period }))
}

// Cents spent per cap key this period: own purchases, private included; a category counts its subcategories.
async function spending(tx: Tx, caller: Caller, period: CapPeriod, now: Date): Promise<(row: Row) => number> {
  const range = capRange(period, todayIn(caller.timezone, now))
  const [byCategory, byCenter] = await Promise.all(['category', 'cost_center'].map((group_by) =>
    getSummary(tx, caller, { ...range, group_by: group_by as 'category' | 'cost_center', period: 'total', scope: 'me' }, now)))
  const find = (rows: { key: string; amount: number }[], key: string) => toCents(rows.find((r) => r.key.toLowerCase() === key.toLowerCase())?.amount ?? 0)
  return (row) => (row.category ? find(byCategory!.totals, row.category) : find(byCenter!.totals, row.cost_center!))
}

export async function listCaps(tx: Tx, caller: Caller, now = new Date()): Promise<CapView[]> {
  const rows = await loadRows(tx, caller)
  if (rows.length === 0) return []
  const spent = { month: await spending(tx, caller, 'month', now), year: rows.some((r) => r.period === 'year') ? await spending(tx, caller, 'year', now) : () => 0 }
  return rows.map((r) => {
    const s = spent[r.period](r)
    return { ...r, amount: fromCents(r.amount), spent: fromCents(s), state: capState(s, r.amount) }
  })
}

export type CapBody = z.infer<typeof api.CapBody>

export async function addCap(tx: Tx, caller: Caller, body: CapBody): Promise<CapView> {
  const vocabulary = await loadVocabulary(tx)
  if (Boolean(body.category) === Boolean(body.cost_center)) throw invalid('invalid_cap', 'A cap is for a category or one of the people & things, one of the two.')
  const { id } = await tx
    .insertInto('caps')
    .values({
      household_id: caller.household_id,
      user_id: caller.user_id,
      category_id: body.category ? vocabulary.categoryId(body.category) : null,
      cost_center_id: body.cost_center ? vocabulary.costCenterId(body.cost_center) : null,
      amount: body.amount,
      period: body.period,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return (await listCaps(tx, caller)).find((c) => c.id === id)!
}

export async function updateCap(tx: Tx, caller: Caller, id: string, patch: z.infer<typeof api.CapPatch>): Promise<CapView> {
  const updated = await tx.updateTable('caps').set({ ...(patch.amount !== undefined && { amount: patch.amount }), ...(patch.period && { period: patch.period }) })
    .where('id', '=', id).where('user_id', '=', caller.user_id).executeTakeFirst()
  if (updated.numUpdatedRows === 0n) throw notFound('Cap')
  return (await listCaps(tx, caller)).find((c) => c.id === id)!
}

export async function deleteCap(tx: Tx, caller: Caller, id: string): Promise<void> {
  const deleted = await tx.deleteFrom('caps').where('id', '=', id).where('user_id', '=', caller.user_id).executeTakeFirst()
  if (deleted.numDeletedRows === 0n) throw notFound('Cap')
}
