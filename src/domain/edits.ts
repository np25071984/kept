import { isLocalDate } from './dates.js'
import { buildLines, resizeLines, type Line, type LineInput, type Result, type SpentFor } from './lines.js'
import type { Cents } from './money.js'

// The user's own edits win: an edit records which fields it changed, so a later source can't undo them (VISION.md §3.4).

export interface Editable {
  amount: Cents
  lines: Line[]
  main_category: string | null
  user_edited: string[]
}

// What the user changed, with the category already resolved to the household's spelling.
export interface Edit {
  amount?: Cents
  category?: string | null
  spent_for?: SpentFor[]
  line_items?: LineInput[]
  date?: string
  merchant?: string | null
}

export interface EditPlan {
  amount: Cents
  // The same array as before when the lines didn't change.
  lines: Line[]
  main_category: string | null
  user_edited: string[]
}

// Changing the category, the split or the line items rebuilds the lines around the rest line; changing only the amount
// lets the rest line absorb the difference.
export function planEdit(existing: Editable, edit: Edit): Result<EditPlan> {
  if (edit.date !== undefined && !isLocalDate(edit.date)) return { ok: false, error: 'invalid_date', message: 'date must be YYYY-MM-DD.' }
  const edited = new Set(existing.user_edited)
  const amount = edit.amount ?? existing.amount
  let lines = existing.lines
  let mainCategory = existing.main_category
  if (edit.line_items !== undefined || edit.category !== undefined || edit.spent_for !== undefined) {
    const rest = existing.lines.find((line) => line.is_rest)
    if (edit.category !== undefined) mainCategory = edit.category
    const built = buildLines({
      amount,
      category: mainCategory ?? rest?.category ?? null,
      spent_for: edit.spent_for ?? rest?.spent_for ?? [],
      line_items: edit.line_items ?? existing.lines.filter((line) => !line.is_rest),
    })
    if (!built.ok) return built
    lines = built.value
    edited.add('line_items')
  } else if (amount !== existing.amount) {
    const resized = resizeLines(existing.lines, amount, mainCategory)
    if (!resized.ok) return resized
    lines = resized.value
  }
  if (amount !== existing.amount) edited.add('amount')
  if (edit.date !== undefined) edited.add('date')
  if (edit.merchant !== undefined) edited.add('merchant')
  return { ok: true, value: { amount, lines, main_category: mainCategory, user_edited: [...edited] } }
}
