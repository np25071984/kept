import { parseAmount, toCents } from './money.js'
import type { Line, SpentFor, Transaction } from './types.js'

// The purchase editor's form, and the PATCH it becomes. The rest line isn't edited directly: it is whatever the
// explicit lines leave of the total, in the main category (VISION.md §3.2).

export interface SpentForForm {
  cost_center: string
  // Percent of the line, or '' to split evenly.
  share: string
}

export interface LineForm {
  amount: string
  category: string
  item: string
  spent_for: SpentForForm[]
}

export interface PurchaseForm {
  date: string
  amount: string
  merchant: string
  notes: string
  private: boolean
  category: string
  spent_for: SpentForForm[]
  lines: LineForm[]
}

const fixed = (amount: number) => amount.toFixed(2)
const spentForForm = (entries: SpentFor[]): SpentForForm[] => entries.map((e) => ({ cost_center: e.cost_center, share: e.share == null ? '' : String(Math.round(e.share * 10000) / 100) }))

export function formFromTransaction(t: Transaction): PurchaseForm {
  const rest = t.line_items.find((line) => line.rest)
  return {
    date: t.date,
    amount: fixed(t.amount),
    merchant: t.merchant ?? '',
    notes: t.notes ?? '',
    private: t.private,
    category: rest?.category ?? t.category ?? '',
    spent_for: spentForForm(rest?.spent_for ?? []),
    lines: t.line_items.filter((line) => !line.rest).map((line: Line) => ({ amount: fixed(line.amount), category: line.category, item: line.item ?? '', spent_for: spentForForm(line.spent_for) })),
  }
}

// What the explicit lines leave of the total, in cents, or null while an amount doesn't parse.
export function restCents(form: PurchaseForm): number | null {
  const total = parseAmount(form.amount)
  const lines = form.lines.map((line) => parseAmount(line.amount))
  if (total == null || lines.some((cents) => cents == null)) return null
  return total - lines.reduce<number>((sum, cents) => sum + cents!, 0)
}

function shareProblems(entries: SpentForForm[], where: string): string[] {
  const problems: string[] = []
  const names = entries.map((e) => e.cost_center.trim().toLowerCase())
  if (names.some((name) => !name)) problems.push(`Pick a cost center for every entry ${where}.`)
  if (new Set(names).size !== names.length) problems.push(`A cost center appears twice ${where}.`)
  const shares = entries.filter((e) => e.share.trim() !== '').map((e) => Number(e.share))
  if (shares.some((share) => !(share > 0 && share <= 100))) problems.push(`Shares ${where} are percentages above 0 and up to 100.`)
  const total = shares.reduce((sum, share) => sum + share, 0)
  if (total > 100.0001) problems.push(`Shares ${where} add up to more than 100%.`)
  if (shares.length === entries.length && entries.length > 0 && Math.abs(total - 100) > 0.0001) problems.push(`Shares ${where} must add up to 100% when every one is given.`)
  return problems
}

export function validateForm(form: PurchaseForm): string[] {
  const problems: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) problems.push('Pick a date.')
  const total = parseAmount(form.amount)
  if (total == null || total <= 0) problems.push('The amount must be a number above zero, like 12.50.')
  form.lines.forEach((line, i) => {
    const cents = parseAmount(line.amount)
    if (cents == null || cents <= 0) problems.push(`Line ${i + 1}: the amount must be above zero.`)
    if (!line.category) problems.push(`Line ${i + 1}: pick a category.`)
    problems.push(...shareProblems(line.spent_for, `on line ${i + 1}`))
  })
  const rest = restCents(form)
  if (rest != null && rest < 0) problems.push('The lines add up to more than the amount.')
  if (rest != null && rest > 0 && !form.category) problems.push('Pick a category for the rest of the amount.')
  problems.push(...shareProblems(form.spent_for, 'for the rest'))
  return problems
}

const spentFor = (entries: SpentForForm[]) => entries.map((e) => ({ cost_center: e.cost_center.trim(), ...(e.share.trim() !== '' && { share: Number(e.share) / 100 }) }))

export function patchFromForm(form: PurchaseForm) {
  return {
    date: form.date,
    amount: toCents(Number(form.amount.replace(/[,$\s]/g, ''))) / 100,
    merchant: form.merchant.trim() || null,
    notes: form.notes.trim() || null,
    private: form.private,
    category: form.category || null,
    spent_for: spentFor(form.spent_for),
    line_items: form.lines.map((line) => ({ amount: Number(line.amount.replace(/[,$\s]/g, '')), category: line.category, item: line.item.trim() || null, spent_for: spentFor(line.spent_for) })),
  }
}
