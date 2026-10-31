import { shiftMonths } from '../../../src/domain/months.js'

// Reports: the trend, and a period broken down by category, people & things or merchant,
// each bar with a tick for the same days of the previous period.

export interface Row { key: string; amount: number; period?: string | null }

// Shared with the landing page's chart (src/domain/months.ts).
export { onTrack, previousRange } from '../../../src/domain/months.js'

// The last 12 months, oldest first, from per-month category totals; only top-level categories add up, subcategories are inside them.
export function trend(rows: Row[], today: string): { month: string; amount: number }[] {
  const months = Array.from({ length: 12 }, (_, i) => shiftMonths(`${today.slice(0, 7)}-01`, 11 - i).slice(0, 7))
  const sums = new Map<string, number>()
  for (const r of rows) if (r.period && !r.key.includes('/')) sums.set(r.period, (sums.get(r.period) ?? 0) + Math.round(r.amount * 100))
  return months.map((month) => ({ month, amount: (sums.get(month) ?? 0) / 100 }))
}

// The average of the 11 months before this one; months before anything was logged don't pull it down.
export function monthlyAverage(months: { amount: number }[]): number | null {
  const past = months.slice(0, 11).filter((m, i, all) => m.amount > 0 || all.slice(0, i).some((x) => x.amount > 0))
  return past.length ? past.reduce((s, m) => s + m.amount, 0) / past.length : null
}

export const topLevelTotal = (rows: Row[]) => rows.filter((r) => !r.key.includes('/')).reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100

export interface Bar { key: string; label: string; amount: number; prev: number; sub: boolean }

const prevOf = (prev: Row[], key: string) => prev.find((r) => r.key.toLowerCase() === key.toLowerCase())?.amount ?? 0

export function categoryBars(cur: Row[], prev: Row[]): Bar[] {
  const keys = [...new Set([...cur, ...prev].map((r) => r.key))]
  const amount = (k: string) => cur.find((r) => r.key === k)?.amount ?? 0
  const kids = (parent: string | null) => keys.filter((k) => (parent ? k.startsWith(`${parent}/`) && !k.slice(parent.length + 1).includes('/') : !k.includes('/')))
    .filter((k) => amount(k) > 0 || prevOf(prev, k) > 0).sort((a, b) => amount(b) - amount(a) || a.localeCompare(b))
  const out: Bar[] = []
  const walk = (parent: string | null) => {
    for (const k of kids(parent)) {
      out.push({ key: k, label: k.split('/').at(-1)!, amount: amount(k), prev: prevOf(prev, k), sub: parent !== null })
      walk(k)
    }
  }
  walk(null)
  return out
}

export const NOBODY = 'Nobody in particular'
export const OTHER = 'Other merchants'

export function peopleBars(cur: Row[], prev: Row[], total: number, prevTotal: number): Bar[] {
  const named = [...new Set([...cur, ...prev].map((r) => r.key))]
    .map((k) => ({ key: k, label: k, amount: cur.find((r) => r.key === k)?.amount ?? 0, prev: prevOf(prev, k), sub: false }))
    .sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key))
  const sum = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100
  const nobody = { key: NOBODY, label: NOBODY, amount: Math.max(0, (Math.round(total * 100) - Math.round(sum(named.map((b) => b.amount)) * 100)) / 100), prev: Math.max(0, (Math.round(prevTotal * 100) - Math.round(sum(named.map((b) => b.prev)) * 100)) / 100), sub: false }
  return [...named, ...(nobody.amount > 0 || nobody.prev > 0 ? [nobody] : [])]
}

export function merchantBars(cur: Row[], prev: Row[], top = 5): Bar[] {
  const ranked = cur.filter((r) => r.key !== OTHER).sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key))
  const shown = ranked.slice(0, top).map((r) => ({ key: r.key, label: r.key, amount: r.amount, prev: prevOf(prev, r.key), sub: false }))
  const cents = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0)
  const shownKeys = new Set(shown.map((b) => b.key.toLowerCase()))
  const rest = cents(cur.filter((r) => !shownKeys.has(r.key.toLowerCase())).map((r) => r.amount))
  const restPrev = cents(prev.filter((r) => !shownKeys.has(r.key.toLowerCase())).map((r) => r.amount))
  return [...shown, ...(rest || restPrev ? [{ key: OTHER, label: OTHER, amount: rest / 100, prev: restPrev / 100, sub: false }] : [])]
}

// The bars drawn: whatever had spending in either period, so a drop to nothing keeps its row with the previous tick.
export function drawnBars(bars: Bar[]): Bar[] {
  return bars.filter((b) => b.amount > 0 || b.prev > 0)
}

// The drawn top-level bar that moved most, leaving out the catch-alls.
export function biggestChange(bars: Bar[]): Bar | null {
  const candidates = drawnBars(bars).filter((b) => !b.sub && b.key !== NOBODY && b.key !== OTHER && b.amount !== b.prev)
  return candidates.sort((a, b) => Math.abs(b.amount - b.prev) - Math.abs(a.amount - a.prev))[0] ?? null
}
