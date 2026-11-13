import { allocate, type SpentFor } from './lines.js'
import type { Cents } from './money.js'

// How much of the filtered purchases the filters pick out, counted as reports count it (summary.ts): a category's lines
// in full, a person or thing by its share, nobody in particular by the lines for no one.

export interface LineFilters {
  category?: string[]
  category_only?: string[]
  cost_center?: string[]
  no_cost_center?: boolean
  item?: string
}

export interface FilteredLine {
  amount: Cents
  category: string
  item: string | null
  spent_for: SpentFor[]
}

export function narrowsLines(f: LineFilters): boolean {
  return Boolean(f.category?.length || f.category_only?.length || f.cost_center?.length || f.no_cost_center || f.item)
}

// What one line counts toward the filters; 0 when it doesn't match.
export function countedAmount(line: FilteredLine, f: LineFilters): Cents {
  const path = line.category.toLowerCase()
  const cats = (f.category ?? []).map((c) => c.toLowerCase())
  const only = (f.category_only ?? []).map((c) => c.toLowerCase())
  if (cats.length + only.length > 0 && !cats.some((c) => path === c || path.startsWith(`${c}/`)) && !only.includes(path)) return 0
  if (f.item && line.item?.toLowerCase() !== f.item.toLowerCase()) return 0
  const people = new Set((f.cost_center ?? []).map((c) => c.toLowerCase()))
  if (people.size === 0 && !f.no_cost_center) return line.amount
  if (line.spent_for.length === 0) return f.no_cost_center ? line.amount : 0
  let sum = 0
  for (const [name, amount] of allocate(line.amount, line.spent_for)) if (people.has(name.toLowerCase())) sum += amount
  return sum
}

export function matchedAmount(lines: FilteredLine[], f: LineFilters): Cents {
  return lines.reduce((sum, line) => sum + countedAmount(line, f), 0)
}