import { locale } from '../i18n.js'

// Amounts arrive as numbers in the household currency; sums are done in cents so they don't drift.

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

// "1,234.50" and, as in Russian, "1 234,50": a comma before one or two final digits is the decimal mark.
export function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(/[$₽€\s\u00a0]/g, '')
  const clean = /^[\d.]*,\d{1,2}$/.test(trimmed) && !trimmed.includes('.') ? trimmed.replace(',', '.') : trimmed.replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return toCents(Number(clean))
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(amount)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}
