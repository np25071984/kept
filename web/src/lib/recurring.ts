import { language, locale, t } from '../i18n.js'

// How a recurring bill's schedule reads on the Recurring page.

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
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(), { ...o, timeZone: 'UTC' }).format(date)
  const day = fmt({ weekday: 'long' })
  if (r.frequency === 'weekly') return r.interval === 1 ? t('Weekly on {day}', { day }) : t('Every {n} weeks on {day}', { n: r.interval, day })
  if (r.frequency === 'monthly') return r.interval === 1 ? t('Monthly on the {day}', { day: language() === 'ru' ? String(date.getUTCDate()) : ordinal(date.getUTCDate()) }) : t('Every {n} months', { n: r.interval })
  return r.interval === 1 ? t('Yearly on {date}', { date: fmt({ month: 'short', day: 'numeric' }) }) : t('Every {n} years', { n: r.interval })
}
