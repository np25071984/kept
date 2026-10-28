import { allocate, type SpentFor } from './lines.js'
import type { Cents } from './money.js'

// Totals for the summary endpoint. Shares only divide a line's amount between cost centers; the stored total never changes (VISION.md §4.A).

export type GroupBy = 'category' | 'cost_center' | 'item'
export type Period = 'month' | 'year' | 'total'

export interface SummaryLine {
  date: string
  amount: Cents
  category: string
  item: string | null
  spent_for: SpentFor[]
}

export interface SummaryRow {
  period: string | null
  key: string
  amount: Cents
}

export function periodOf(date: string, period: Period): string | null {
  if (period === 'month') return date.slice(0, 7)
  if (period === 'year') return date.slice(0, 4)
  return null
}

export function summarize(lines: SummaryLine[], groupBy: GroupBy, period: Period): SummaryRow[] {
  const totals = new Map<string, SummaryRow>()
  const add = (p: string | null, key: string, amount: Cents) => {
    const id = `${p ?? ''}|${key.toLowerCase()}`
    const row = totals.get(id) ?? { period: p, key, amount: 0 }
    row.amount += amount
    totals.set(id, row)
  }
  for (const line of lines) {
    const p = periodOf(line.date, period)
    if (groupBy === 'category') {
      // A subcategory also counts in each of its parents.
      const parts = line.category.split('/')
      for (let depth = 1; depth <= parts.length; depth++) add(p, parts.slice(0, depth).join('/'), line.amount)
    } else if (groupBy === 'item') {
      if (line.item) add(p, line.item.toLowerCase(), line.amount)
    } else {
      for (const [name, amount] of allocate(line.amount, line.spent_for)) add(p, name, amount)
    }
  }
  return [...totals.values()].sort((a, b) => (a.period ?? '').localeCompare(b.period ?? '') || b.amount - a.amount || a.key.localeCompare(b.key))
}