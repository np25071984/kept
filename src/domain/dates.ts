// Dates are local calendar dates, 'YYYY-MM-DD', computed in UTC so no machine time zone leaks in.

export type LocalDate = string

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isLocalDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return value.includes('/') || value === 'UTC'
  } catch {
    return false
  }
}

export function todayIn(timeZone: string, now: Date): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = parse(date)
  d.setUTCDate(d.getUTCDate() + days)
  return format(d)
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function parts(date: LocalDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return { year, month, day }
}

export function fromParts(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parse(date: LocalDate): Date {
  return new Date(`${date}T00:00:00Z`)
}

function format(date: Date): LocalDate {
  return date.toISOString().slice(0, 10)
}