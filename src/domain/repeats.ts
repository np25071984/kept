import { addDays, daysInMonth, fromParts, parts, type LocalDate } from './dates.js'

export type Frequency = 'weekly' | 'monthly' | 'yearly'

export interface Schedule {
  frequency: Frequency
  interval: number
  anchor: LocalDate
}

// The transaction a repeat creates, in the same shape POST /transactions accepts.
export interface RepeatTemplate {
  amount: number
  merchant: string | null
  notes: string | null
  private: boolean
  category: string | null
  line_items: { amount: number; category: string; item?: string | null; notes?: string | null; spent_for?: { cost_center: string; share?: number | null }[]; is_rest?: boolean }[]
}

export interface RepeatState extends Schedule {
  next_date: LocalDate
  ends_on: LocalDate | null
  remaining: number | null
  paused: boolean
}

// The k-th occurrence counted from the anchor. A day the month doesn't have falls on its last day (VISION.md §3.5).
export function occurrence(schedule: Schedule, k: number): LocalDate {
  const { year, month, day } = parts(schedule.anchor)
  if (schedule.frequency === 'weekly') return addDays(schedule.anchor, 7 * schedule.interval * k)
  if (schedule.frequency === 'monthly') {
    const index = month - 1 + schedule.interval * k
    const y = year + Math.floor(index / 12)
    const m = (index % 12) + 1
    return fromParts(y, m, Math.min(day, daysInMonth(y, m)))
  }
  const y = year + schedule.interval * k
  return fromParts(y, month, Math.min(day, daysInMonth(y, month)))
}

// First occurrence strictly after `date`.
export function occurrenceAfter(schedule: Schedule, date: LocalDate): LocalDate {
  for (let k = 0; ; k++) {
    const candidate = occurrence(schedule, k)
    if (candidate > date) return candidate
  }
}

// First occurrence on or after `date`.
export function occurrenceOnOrAfter(schedule: Schedule, date: LocalDate): LocalDate {
  for (let k = 0; ; k++) {
    const candidate = occurrence(schedule, k)
    if (candidate >= date) return candidate
  }
}

// The purchase is the first occurrence, so the next falls after it. An anchor later than the purchase starts the
// schedule there, on the anchor itself.
export function firstNextDate(schedule: Schedule, purchaseDate: LocalDate): LocalDate {
  return occurrenceAfter(schedule, purchaseDate < schedule.anchor ? addDays(schedule.anchor, -1) : purchaseDate)
}

// The next date after a repeat is changed: a new schedule or a resume starts from today, skipping dates missed while
// paused; anything else keeps the date it had.
export function nextDateAfterChange(schedule: Schedule, next: LocalDate, today: LocalDate, restart: boolean): LocalDate {
  if (!restart) return next
  return occurrenceOnOrAfter(schedule, today > next ? today : next)
}

export interface DuePlan {
  dates: LocalDate[]
  next: RepeatState
  finished: boolean
}

// Which occurrences to create on `today`, and the repeat's state afterwards.
export function dueOccurrences(repeat: RepeatState, today: LocalDate): DuePlan {
  const dates: LocalDate[] = []
  let next = repeat.next_date
  let remaining = repeat.remaining
  let finished = isFinished(repeat.ends_on, remaining, next)
  if (!repeat.paused) {
    while (!finished && next <= today) {
      dates.push(next)
      if (remaining != null) remaining--
      next = occurrenceAfter(repeat, next)
      finished = isFinished(repeat.ends_on, remaining, next)
    }
  }
  return { dates, next: { ...repeat, next_date: next, remaining }, finished }
}

function isFinished(endsOn: LocalDate | null, remaining: number | null, next: LocalDate): boolean {
  return (remaining != null && remaining <= 0) || (endsOn != null && next > endsOn)
}
// What active repeats still log this month after `today`'s run: each occurrence from its next date to the month's end.
export function stillToCome(repeats: (RepeatState & { amount: number })[], today: LocalDate): number {
  const { year, month } = parts(today)
  const monthEnd = fromParts(year, month, daysInMonth(year, month))
  return repeats.reduce((sum, r) => sum + dueOccurrences(r, monthEnd).dates.filter((d) => d >= today).length * r.amount, 0)
}
