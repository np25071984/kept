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

export function formatAmount(cents: Cents, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}