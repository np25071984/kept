import type { SelectQueryBuilder } from 'kysely'
import type { Tx } from '../db/db.js'
import type { Database } from '../db/schema.js'
import type { SpentFor } from '../domain/lines.js'
import { numericToCents, type Cents } from '../domain/money.js'

// Line items as reports count them, with whom each was for: the summary and the purchase list's lines_total read the
// same rows, so a report row and the list it opens agree.

export interface LoadedLine {
  transaction_id: string
  date: string
  checked_groups: string[]
  merchant: string | null
  spent_by: string
  amount: Cents
  category: string
  item: string | null
  spent_for: SpentFor[]
}

export type TransactionIds = SelectQueryBuilder<Database, 'transactions', { id: string }>

export async function loadLines(tx: Tx, ids: TransactionIds): Promise<LoadedLine[]> {
  const rows = await tx
    .selectFrom('transactions')
    .innerJoin('line_items', 'line_items.transaction_id', 'transactions.id')
    .innerJoin('categories', 'categories.id', 'line_items.category_id')
    .select(['transactions.id as transaction_id', 'transactions.date', 'transactions.checked_groups', 'transactions.merchant', 'transactions.spent_by', 'line_items.id', 'line_items.amount', 'line_items.item', 'categories.path'])
    .where('transactions.id', 'in', ids)
    .execute()
  const shares = rows.length === 0 ? [] : await tx
    .selectFrom('line_item_cost_centers')
    .innerJoin('cost_centers', 'cost_centers.id', 'line_item_cost_centers.cost_center_id')
    .innerJoin('line_items', 'line_items.id', 'line_item_cost_centers.line_item_id')
    .select(['line_item_cost_centers.line_item_id', 'cost_centers.name', 'line_item_cost_centers.share'])
    .where('line_items.transaction_id', 'in', ids)
    .execute()
  const spentFor = new Map<string, SpentFor[]>()
  for (const s of shares) spentFor.set(s.line_item_id, [...(spentFor.get(s.line_item_id) ?? []), { cost_center: s.name, share: s.share == null ? null : Number(s.share) }])
  return rows.map((row) => ({
    transaction_id: row.transaction_id,
    date: row.date,
    checked_groups: row.checked_groups,
    merchant: row.merchant,
    spent_by: row.spent_by,
    amount: numericToCents(row.amount),
    category: row.path,
    item: row.item,
    spent_for: spentFor.get(row.id) ?? [],
  }))
}