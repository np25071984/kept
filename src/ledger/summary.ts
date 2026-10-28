import type { Tx } from '../db/db.js'
import { computeCoverage, type CoverageTransaction, type WatchedGroup } from '../domain/coverage.js'
import { daysInMonth, isLocalDate, parts, todayIn } from '../domain/dates.js'
import { fromCents, numericToCents } from '../domain/money.js'
import { summarize, type GroupBy, type Period, type SummaryLine } from '../domain/summary.js'
import type { Caller } from './caller.js'
import { invalid } from './errors.js'
import { loadRules } from './rules.js'

export interface SummaryQuery {
  from?: string
  to?: string
  group_by?: GroupBy
  period?: Period
  scope?: 'me' | 'household'
}

// `me` covers the caller's own purchases, private included; `household` every member's non-private ones, never by member.
export async function getSummary(tx: Tx, caller: Caller, query: SummaryQuery, now = new Date()) {
  const today = parts(todayIn(caller.timezone, now))
  const from = query.from ?? `${today.year}-${String(today.month).padStart(2, '0')}-01`
  const to = query.to ?? `${today.year}-${String(today.month).padStart(2, '0')}-${daysInMonth(today.year, today.month)}`
  if (!isLocalDate(from) || !isLocalDate(to)) throw invalid('invalid_date', 'from and to must be YYYY-MM-DD.')
  const scope = query.scope ?? 'me'
  const groupBy = query.group_by ?? 'category'
  const period = query.period ?? 'total'

  const rows = await tx
    .selectFrom('transactions')
    .innerJoin('line_items', 'line_items.transaction_id', 'transactions.id')
    .innerJoin('categories', 'categories.id', 'line_items.category_id')
    .select(['transactions.id as transaction_id', 'transactions.date', 'transactions.checked_groups', 'line_items.id', 'line_items.amount', 'line_items.item', 'categories.path'])
    .where('transactions.date', '>=', from)
    .where('transactions.date', '<=', to)
    .$if(scope === 'me', (q) => q.where('transactions.spent_by', '=', caller.user_id))
    .$if(scope === 'household', (q) => q.where('transactions.private', '=', false))
    .execute()
  const shares = rows.length === 0 ? [] : await tx
    .selectFrom('line_item_cost_centers')
    .innerJoin('cost_centers', 'cost_centers.id', 'line_item_cost_centers.cost_center_id')
    .select(['line_item_id', 'cost_centers.name', 'share'])
    .where('line_item_id', 'in', rows.map((r) => r.id))
    .execute()

  const lines: SummaryLine[] = rows.map((row) => ({
    date: row.date,
    amount: numericToCents(row.amount),
    category: row.path,
    item: row.item,
    spent_for: shares.filter((s) => s.line_item_id === row.id).map((s) => ({ cost_center: s.name, share: s.share == null ? null : Number(s.share) })),
  }))

  const byTransaction = new Map<string, CoverageTransaction>()
  for (const row of rows) {
    const entry = byTransaction.get(row.transaction_id) ?? { checked_groups: row.checked_groups, lines: [] }
    entry.lines.push({ amount: numericToCents(row.amount), category: row.path, item: row.item })
    byTransaction.set(row.transaction_id, entry)
  }
  const groups = (await loadRules(tx, caller)).flatMap((rule): WatchedGroup[] => {
    if (rule.kind !== 'watch') return []
    const { category, item } = rule.params as { category?: string; item?: string }
    return category ? [{ kind: 'category', path: category }] : item ? [{ kind: 'item', item }] : []
  })
  const unique = [...new Map(groups.map((g) => [(g.kind === 'category' ? g.path : g.item).toLowerCase(), g])).values()]

  return {
    from,
    to,
    scope,
    group_by: groupBy,
    period,
    currency: caller.currency,
    totals: summarize(lines, groupBy, period).map((row) => ({ ...row, amount: fromCents(row.amount) })),
    watched: unique.map((group) => {
      const coverage = computeCoverage(group, [...byTransaction.values()])
      return { ...coverage, total: fromCents(coverage.total), estimate: coverage.estimate == null ? null : fromCents(coverage.estimate) }
    }),
  }
}