// Amounts are integer cents inside Kept and decimal numbers on the wire and in PostgreSQL.

export type Cents = number

export function toCents(amount: number): Cents {
  return Math.round(amount * 100)
}

export function fromCents(cents: Cents): number {
  return cents / 100
}

// PostgreSQL returns `numeric` as a string, e.g. "60.00".
export function numericToCents(value: string | number): Cents {
  return Math.round(Number(value) * 100)
}

export function centsToNumeric(cents: Cents): string {
  return (cents / 100).toFixed(2)
}

// Decimals a currency has, at most the two the ledger stores: 2 for USD, 0 for JPY.
export function currencyDigits(currency: string): number {
  return Math.min(2, new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2)
}

// An amount finer than the currency would be rounded without a word, so it is refused.
export function amountProblem(amount: number, currency: string): string | null {
  const digits = currencyDigits(currency)
  const scaled = amount * 10 ** digits
  if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return null
  return `${amount} has more decimals than ${currency} has (${digits}).`
}

export function formatAmount(cents: Cents, currency: string, language: 'en' | 'ru' = 'en'): string {
  return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency }).format(cents / 100)
}