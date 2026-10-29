import { daysInMonth, fromParts, parts, type LocalDate } from './dates.js'
import type { Cents } from './money.js'

// Caps are soft reminders (VISION.md §4.A, "Caps"): nothing is blocked. Close from 80%; crossing gets one line.

export type CapPeriod = 'month' | 'year'

export const CLOSE_SHARE = 0.8

export function capRange(period: CapPeriod, today: LocalDate): { from: LocalDate; to: LocalDate } {
  const { year, month } = parts(today)
  return period === 'month'
    ? { from: fromParts(year, month, 1), to: fromParts(year, month, daysInMonth(year, month)) }
    : { from: fromParts(year, 1, 1), to: fromParts(year, 12, 31) }
}

export type CapState = 'under' | 'close' | 'over'

export function capState(spent: Cents, amount: Cents): CapState {
  if (spent > amount) return 'over'
  return spent >= amount * CLOSE_SHARE ? 'close' : 'under'
}

// What a purchase that took a cap from `before` to `after` should mention, if anything: the first time it passes 80%, and crossing.
export function capReminder(before: Cents, after: Cents, amount: Cents): Exclude<CapState, 'under'> | null {
  const was = capState(before, amount)
  const now = capState(after, amount)
  if (now === was || now === 'under') return null
  return now
}
