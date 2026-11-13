import type { z } from 'zod'
import type * as api from '../api/ledger.js'
import type { Tx } from '../db/db.js'
import { computeCoverage, type CoverageTransaction } from '../domain/coverage.js'
import { daysInMonth, isLocalDate, parts, todayIn } from '../domain/dates.js'
import { fromCents } from '../domain/money.js'
import { summarize, type SummaryLine } from '../domain/summary.js'
import type { Caller } from './caller.js'
import { invalid } from './errors.js'
import { loadLines } from './lines.js'
import { watchedGroups } from './watches.js'

export type SummaryQuery = z.infer<typeof api.SummaryQuery>

// `me` covers the caller's own purchases, private included; `household` every member's non-private ones, never by member.
export async function getSummary(tx: Tx, caller: Caller, query: SummaryQuery, now = new Date()) {
  const today = parts(todayIn(caller.timezone, now))
  const from = query.from ?? `${today.year}-${String(today.month).padStart(2, '0')}-01`
  const to = query.to ?? `${today.year}-${String(today.month).padStart(2, '0')}-${daysInMonth(today.year, today.month)}`
  if (!isLocalDate(from) || !isLocalDate(to)) throw invalid('invalid_date', 'from and to must be YYYY-MM-DD.')
  const scope = query.scope ?? 'me'
  const groupBy = query.group_by ?? 'category'
  const period = query.period ?? 'total'

  const rows = await loadLines(tx, tx
    .selectFrom('transactions')
    .select('transactions.id')
    .where('transactions.date', '>=', from)
    .where('transactions.date', '<=', to)
    .$if(scope === 'me', (q) => q.where('transactions.spent_by', '=', caller.user_id))
    .$if(scope === 'household', (q) => q.where('transactions.private', '=', false)))

  const lines: SummaryLine[] = rows.map((row) => ({
    date: row.date,
    amount: row.amount,
    category: row.category,
    item: row.item,
    spent_for: row.spent_for,
    merchant: row.merchant,
    member: row.spent_by,
  }))

  const byTransaction = new Map<string, CoverageTransaction>()
  for (const row of rows) {
    const entry = byTransaction.get(row.transaction_id) ?? { checked_groups: row.checked_groups, lines: [] }
    entry.lines.push({ amount: row.amount, category: row.category, item: row.item })
    byTransaction.set(row.transaction_id, entry)
  }
  const groups = await watchedGroups(tx, caller)

  return {
    from,
    to,
    scope,
    group_by: groupBy,
    period,
    currency: caller.currency,
    totals: summarize(lines, groupBy, period, scope === 'household' ? 2 : 1).map((row) => ({ ...row, amount: fromCents(row.amount) })),
    watched: groups.map((group) => {
      const coverage = computeCoverage(group, [...byTransaction.values()])
      return { ...coverage, total: fromCents(coverage.total), estimate: coverage.estimate == null ? null : fromCents(coverage.estimate) }
    }),
  }
}