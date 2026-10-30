// Calendar arithmetic on YYYY-MM-DD strings, shared by the web app's reports and the landing page's chart.

const pad = (n: number) => String(n).padStart(2, '0')
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const date = (s: string) => new Date(`${s}T00:00:00Z`)

export function shiftMonths(s: string, months: number): string {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  const index = y * 12 + (m - 1) - months
  const ny = Math.floor(index / 12)
  const nm = (index % 12) + 1
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysIn(ny, nm)))}`
}

// The same days of the previous period: Oct 1–29 → Sep 1–29; a range starting on the 1st moves by whole months, any other by its length.
export function previousRange(from: string, to: string): { from: string; to: string } {
  if (from.endsWith('-01')) {
    const [fy, fm] = from.split('-').map(Number) as [number, number]
    const [ty, tm] = to.split('-').map(Number) as [number, number]
    const months = (ty - fy) * 12 + (tm - fm) + 1
    return { from: shiftMonths(from, months), to: shiftMonths(to, months) }
  }
  const days = (date(to).getTime() - date(from).getTime()) / 86_400_000 + 1
  const shift = (s: string) => ymd(new Date(date(s).getTime() - days * 86_400_000))
  return { from: shift(from), to: shift(to) }
}

// What the running month is on track for, at its pace so far.
export function onTrack(soFar: number, today: string): number {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  return Math.round((soFar / d) * daysIn(y, m) * 100) / 100
}
