// Amounts arrive as numbers in the household currency; sums are done in cents so they don't drift.

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function parseAmount(text: string): number | null {
  const clean = text.trim().replace(/[,$\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return toCents(Number(clean))
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}
