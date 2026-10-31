import { daysInMonth, fromParts, parts, type LocalDate } from './dates.js'
import { formatAmount, toCents, type Cents } from './money.js'

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

export interface CapSpend {
  id: string
  category: string | null
  cost_center: string | null
  amount: number
  period: CapPeriod
  spent: number
}

// Lines for a write result: the caps a write took past 80% or over, from the caps' spending before and after it.
export function capNotes(before: CapSpend[], after: CapSpend[], currency: string): string[] {
  const notes: string[] = []
  for (const cap of after) {
    const spent = toCents(cap.spent)
    const was = toCents(before.find((b) => b.id === cap.id)?.spent ?? 0)
    if (spent === was) continue
    const amount = toCents(cap.amount)
    const name = cap.category ?? cap.cost_center
    const when = cap.period === 'month' ? 'this month' : 'this year'
    const reminder = capReminder(was, spent, amount)
    if (reminder === 'close') notes.push(`That's ${formatAmount(spent, currency)} of the ${formatAmount(amount, currency)} ${name} cap ${when}.`)
    if (reminder === 'over') notes.push(`That puts ${name} ${formatAmount(spent - amount, currency)} over the cap ${when}.`)
  }
  return notes
}
