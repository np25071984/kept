import { currencyDigits } from './money.js'

// The CSV form of a member's export: one row per purchase, for a spreadsheet. The JSON form holds everything else.

export interface CsvPurchase {
  id: string
  date: string
  amount: number
  merchant: string | null
  notes: string | null
  private: boolean
  line_items: { category: string; item: string | null; spent_for: { cost_center: string }[] }[]
}

const HEADER = ['date', 'merchant', 'amount', 'currency', 'categories', 'items', 'people_and_things', 'private', 'notes', 'id']

// Merchants and notes come from receipts and emails, so a value a spreadsheet would run as a formula is prefixed to stay text.
// Includes the fullwidth forms, which some spreadsheets treat the same way.
const FORMULA = /^[\t\r]|^\s*[=+\-@＝＋－＠]/

export function csvCell(value: string): string {
  const text = FORMULA.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const joined = (values: string[]) => [...new Set(values)].join('; ')

// Starts with a byte order mark, without which Excel misreads non-Latin text such as Russian.
export function purchasesCsv(purchases: CsvPurchase[], currency: string): string {
  const digits = currencyDigits(currency)
  const rows = purchases.map((p) => [
    p.date,
    p.merchant ?? '',
    p.amount.toFixed(digits),
    currency,
    joined(p.line_items.map((l) => l.category)),
    joined(p.line_items.flatMap((l) => (l.item ? [l.item] : []))),
    joined(p.line_items.flatMap((l) => l.spent_for.map((s) => s.cost_center))),
    p.private ? 'yes' : 'no',
    p.notes ?? '',
    p.id,
  ])
  return `﻿${[HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

// The filename a download is saved under, from the response's Content-Disposition header.
export function attachmentName(header: string | null, fallback: string): string {
  return header?.match(/filename="([^"]+)"/)?.[1] ?? fallback
}
