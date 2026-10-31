import { addDays, daysBetween, daysInMonth, fromParts, parts } from './dates.js'

// Calendar arithmetic on YYYY-MM-DD strings, shared by the web app's reports and the landing page's chart.

export function shiftMonths(s: string, months: number): string {
  const { year, month, day } = parts(s)
  const index = year * 12 + (month - 1) - months
  const y = Math.floor(index / 12)
  const m = (index % 12) + 1
  return fromParts(y, m, Math.min(day, daysInMonth(y, m)))
}

// The same days of the previous period: Oct 1–29 → Sep 1–29; a range starting on the 1st moves by whole months, any other by its length.
export function previousRange(from: string, to: string): { from: string; to: string } {
  if (from.endsWith('-01')) {
    const [fy, fm] = from.split('-').map(Number) as [number, number]
    const [ty, tm] = to.split('-').map(Number) as [number, number]
    const months = (ty - fy) * 12 + (tm - fm) + 1
    return { from: shiftMonths(from, months), to: shiftMonths(to, months) }
  }
  const days = daysBetween(from, to) + 1
  return { from: addDays(from, -days), to: addDays(to, -days) }
}

// What the running month is on track for, at its pace so far.
export function onTrack(soFar: number, today: string): number {
  const { year, month, day } = parts(today)
  return Math.round((soFar / day) * daysInMonth(year, month) * 100) / 100
}
