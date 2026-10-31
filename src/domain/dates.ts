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

// Where and when a purchase happened, as a client sent them: the time zone must be an IANA name and the moment a timestamp.
// Returns the moment as ISO 8601, or what is wrong.
export function checkWhen(input: { timezone?: string; occurred_at?: string | null }): { ok: true; value: string | null | undefined } | { ok: false; error: string; message: string } {
  if (input.timezone !== undefined && !isTimeZone(input.timezone)) return { ok: false, error: 'invalid_timezone', message: `"${input.timezone}" is not an IANA time zone name.` }
  if (input.occurred_at === undefined || input.occurred_at === null) return { ok: true, value: input.occurred_at }
  const moment = new Date(input.occurred_at)
  if (Number.isNaN(moment.getTime())) return { ok: false, error: 'invalid_occurred_at', message: 'occurred_at must be an ISO timestamp.' }
  return { ok: true, value: moment.toISOString() }
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
// Days back past which a date said in conversation is checked with the user: the usual slip there is the wrong year.
const TALK_DATE_CHECK_DAYS = 60

// Why a purchase's date may not be what the user meant, or null. The purchase is written either way.
export function dateWarning(date: LocalDate, today: LocalDate, fromTalk: boolean): string | null {
  const age = daysBetween(date, today)
  if (age < 0) return `${date} is in the future. Check the date with the user.`
  if (fromTalk && age > TALK_DATE_CHECK_DAYS) return `${date} is ${age} days ago. Check the date with the user, especially the year.`
  return null
}
