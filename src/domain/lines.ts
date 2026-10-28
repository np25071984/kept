import type { Cents } from './money.js'

export interface SpentFor {
  cost_center: string
  share?: number | null
}

export interface LineInput {
  amount: Cents
  category: string
  item?: string | null
  notes?: string | null
  spent_for?: SpentFor[]
}

export interface Line extends LineInput {
  is_rest: boolean
}

export interface LinesInput {
  amount: Cents
  category?: string | null
  spent_for?: SpentFor[]
  line_items?: LineInput[]
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; message: string }

const SHARE_EPSILON = 1e-6

// Explicit line items plus one rest line for whatever they leave of the total, in the main category (VISION.md §3.2).
export function buildLines(input: LinesInput): Result<Line[]> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return fail('invalid_amount', 'The amount must be greater than zero.')
  }
  const explicit = input.line_items ?? []
  for (const line of explicit) {
    if (!Number.isInteger(line.amount) || line.amount <= 0) {
      return fail('invalid_amount', 'Every line item amount must be greater than zero.')
    }
    const shares = validateShares(line.spent_for ?? [])
    if (!shares.ok) return shares
  }
  const topShares = validateShares(input.spent_for ?? [])
  if (!topShares.ok) return topShares

  const explicitSum = explicit.reduce((sum, line) => sum + line.amount, 0)
  if (explicitSum > input.amount) {
    return fail('line_items_exceed_amount', 'Line items add up to more than the transaction amount.')
  }
  const lines: Line[] = explicit.map((line) => ({ ...line, is_rest: false }))
  const rest = input.amount - explicitSum
  if (rest > 0) {
    if (!input.category) {
      return fail('category_required', 'A category is needed for the part of the amount the line items do not cover.')
    }
    lines.push({ amount: rest, category: input.category, spent_for: input.spent_for ?? [], is_rest: true })
  }
  return { ok: true, value: lines }
}

// Changes the total and lets the rest line absorb the difference. Fails when explicit lines would exceed the new total.
export function resizeLines(lines: Line[], amount: Cents, mainCategory: string | null): Result<Line[]> {
  const explicit = lines.filter((line) => !line.is_rest)
  const restLine = lines.find((line) => line.is_rest)
  return buildLines({
    amount,
    category: restLine?.category ?? mainCategory,
    spent_for: restLine?.spent_for ?? [],
    line_items: explicit,
  })
}

// Shares are fractions of a line item. Entries without one split the remainder evenly (VISION.md §4.A).
export function validateShares(spentFor: SpentFor[]): Result<SpentFor[]> {
  const names = new Set<string>()
  let total = 0
  let unshared = 0
  for (const entry of spentFor) {
    const key = entry.cost_center.trim().toLowerCase()
    if (names.has(key)) return fail('duplicate_cost_center', `"${entry.cost_center}" appears twice in spent_for.`)
    names.add(key)
    if (entry.share == null) {
      unshared++
      continue
    }
    if (!(entry.share > 0 && entry.share <= 1)) return fail('invalid_share', 'A share must be above 0 and at most 1.')
    total += entry.share
  }
  if (total > 1 + SHARE_EPSILON) return fail('shares_exceed_one', 'Shares add up to more than 1.')
  if (spentFor.length > 0 && unshared === 0 && total < 1 - SHARE_EPSILON) {
    return fail('shares_incomplete', 'When every cost center has a share, the shares must add up to 1.')
  }
  if (unshared > 0 && total >= 1 - SHARE_EPSILON) {
    return fail('shares_exceed_one', 'Shares leave nothing for the cost centers without one.')
  }
  return { ok: true, value: spentFor }
}

// Divides an amount between cost centers by their shares, to the cent, with the rounding remainder going to the largest fractions.
export function allocate(amount: Cents, spentFor: SpentFor[]): Map<string, Cents> {
  const result = new Map<string, Cents>()
  if (spentFor.length === 0) return result
  const explicitTotal = spentFor.reduce((sum, entry) => sum + (entry.share ?? 0), 0)
  const unshared = spentFor.filter((entry) => entry.share == null).length
  const evenShare = unshared > 0 ? (1 - explicitTotal) / unshared : 0
  const exact = spentFor.map((entry) => ({ name: entry.cost_center, value: amount * (entry.share ?? evenShare) }))
  const floors = exact.map((entry) => ({ ...entry, cents: Math.floor(entry.value + 1e-9) }))
  let remainder = amount - floors.reduce((sum, entry) => sum + entry.cents, 0)
  const order = [...floors].sort((a, b) => (b.value - b.cents) - (a.value - a.cents))
  for (const entry of order) {
    if (remainder <= 0) break
    entry.cents++
    remainder--
  }
  for (const entry of floors) result.set(entry.name, entry.cents)
  return result
}

function fail<T>(error: string, message: string): Result<T> {
  return { ok: false, error, message }
}