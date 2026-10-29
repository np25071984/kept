// How a recurring bill's schedule reads on the Recurring page (docs/mockups/recurring.html).

export interface Cadence {
  frequency: 'weekly' | 'monthly' | 'yearly'
  interval: number
  anchor: string
}

export function ordinal(n: number): string {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

export function cadence(r: Cadence): string {
  const date = new Date(`${r.anchor}T00:00:00Z`)
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(date)
  if (r.frequency === 'weekly') return r.interval === 1 ? `Weekly on ${fmt({ weekday: 'long' })}` : `Every ${r.interval} weeks on ${fmt({ weekday: 'long' })}`
  if (r.frequency === 'monthly') return r.interval === 1 ? `Monthly on the ${ordinal(date.getUTCDate())}` : `Every ${r.interval} months`
  return r.interval === 1 ? `Yearly on ${fmt({ month: 'short', day: 'numeric' })}` : `Every ${r.interval} years`
}
