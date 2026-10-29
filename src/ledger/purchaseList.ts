import { sql, type ExpressionBuilder } from 'kysely'
import type { Tx } from '../db/db.js'
import type { Database } from '../db/schema.js'
import { fromCents, numericToCents } from '../domain/money.js'
import type { Caller } from './caller.js'
import { loadViews, type TransactionView } from './transactions.js'

// The caller's purchases, filtered and paged (docs/mockups/purchases.html). Never another member's.

export interface ListFilters {
  from?: string
  to?: string
  merchant?: string
  item?: string
  // Merchant or item, contains.
  q?: string
  private?: boolean
  // Each category with its subcategories; `category_only` without them.
  category?: string[]
  category_only?: string[]
  cost_center?: string[]
  // Purchases with a line for nobody in particular.
  no_cost_center?: boolean
  limit?: number
  offset?: number
}

type Eb = ExpressionBuilder<Database, 'transactions'>

const lower = (s: string) => s.toLowerCase()

function lineFilter(eb: Eb, filters: ListFilters) {
  const cats = (filters.category ?? []).map(lower)
  const only = (filters.category_only ?? []).map(lower)
  const people = (filters.cost_center ?? []).map(lower)
  const hasCategory = cats.length + only.length > 0
  const hasPeople = people.length > 0 || filters.no_cost_center
  if (!hasCategory && !hasPeople && !filters.item) return null
  return eb.exists(
    eb
      .selectFrom('line_items')
      .innerJoin('categories', 'categories.id', 'line_items.category_id')
      .select('line_items.id')
      .whereRef('line_items.transaction_id', '=', 'transactions.id')
      .$if(hasCategory, (q) =>
        q.where((e) => e.or([
          ...cats.flatMap((c) => [e(e.fn('lower', ['categories.path']), '=', c), e(e.fn('lower', ['categories.path']), 'like', `${c}/%`)]),
          ...only.map((c) => e(e.fn('lower', ['categories.path']), '=', c)),
        ])))
      .$if(filters.item != null, (q) => q.where((e) => e(e.fn('lower', ['line_items.item']), '=', lower(filters.item!))))
      .$if(!!hasPeople, (q) =>
        q.where((e) => {
          const named = e.exists(
            e.selectFrom('line_item_cost_centers')
              .innerJoin('cost_centers', 'cost_centers.id', 'line_item_cost_centers.cost_center_id')
              .select('line_item_cost_centers.line_item_id')
              .whereRef('line_item_cost_centers.line_item_id', '=', 'line_items.id')
              .where((x) => x(x.fn('lower', ['cost_centers.name']), 'in', people.length ? people : [''])),
          )
          const nobody = e.not(e.exists(e.selectFrom('line_item_cost_centers').select('line_item_id').whereRef('line_item_cost_centers.line_item_id', '=', 'line_items.id')))
          return filters.no_cost_center ? (people.length ? e.or([named, nobody]) : nobody) : named
        })),
  )
}

export async function listPurchases(tx: Tx, caller: Caller, filters: ListFilters): Promise<{ transactions: TransactionView[]; count: number; total: number }> {
  let query = tx.selectFrom('transactions').where('transactions.spent_by', '=', caller.user_id)
  if (filters.from) query = query.where('transactions.date', '>=', filters.from)
  if (filters.to) query = query.where('transactions.date', '<=', filters.to)
  if (filters.merchant) query = query.where('transactions.merchant', 'ilike', `%${filters.merchant}%`)
  if (filters.private !== undefined) query = query.where('transactions.private', '=', filters.private)
  if (filters.q) {
    const q = `%${filters.q.trim()}%`
    query = query.where((eb) => eb.or([
      eb('transactions.merchant', 'ilike', q),
      eb.exists(eb.selectFrom('line_items').select('line_items.id').whereRef('line_items.transaction_id', '=', 'transactions.id').where('line_items.item', 'ilike', q)),
    ]))
  }
  query = query.where((eb) => lineFilter(eb, filters) ?? sql<boolean>`true`)
  const totals = await query.select((eb) => [eb.fn.countAll<string>().as('count'), eb.fn.sum<string | null>('transactions.amount').as('total')]).executeTakeFirstOrThrow()
  const rows = await query
    .select('transactions.id')
    .orderBy('transactions.date', 'desc')
    .orderBy('transactions.created_at', 'desc')
    .limit(Math.min(filters.limit ?? 50, 500))
    .offset(filters.offset ?? 0)
    .execute()
  return { transactions: await loadViews(tx, caller, rows.map((r) => r.id)), count: Number(totals.count), total: fromCents(numericToCents(totals.total ?? '0')) }
}
