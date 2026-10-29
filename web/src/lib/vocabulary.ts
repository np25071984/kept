import type { Note, Rule } from './types.js'

// Categories as a tree, rules in plain words, and the note form (VISION.md §4.C, "Household" and "Me").

export interface TreeRow {
  path: string
  name: string
  depth: number
}

// Every category under its parent, alphabetically at each level.
export function categoryTree(paths: string[]): TreeRow[] {
  const byParts = (a: string, b: string) => {
    const [x, y] = [a.split('/'), b.split('/')]
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const order = x[i]!.localeCompare(y[i]!, undefined, { sensitivity: 'base' })
      if (order !== 0) return order
    }
    return x.length - y.length
  }
  const sorted = [...paths].sort(byParts)
  return sorted.map((path) => {
    const parts = path.split('/')
    return { path, name: parts.at(-1)!, depth: parts.length - 1 }
  })
}

const KIND_LABELS: Record<Rule['kind'], string> = {
  watch: 'Watch',
  ask_breakdown: 'Ask what was bought',
  set_category: 'Category',
  set_spent_for: 'Who or what for',
  set_private: 'Private',
}

export function ruleKindLabel(rule: Rule): string {
  return KIND_LABELS[rule.kind] ?? rule.kind
}

// Where a rule applies: "Costco · Groceries", or "Everywhere".
export function ruleScope(rule: Rule): string {
  const parts = [rule.merchant, rule.category, rule.account_ref && `account ${rule.account_ref}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Everywhere'
}

export interface NoteForm {
  text: string
  cost_centers: string[]
  categories: string[]
  merchants: string
  expires_on: string
}

export const emptyNote: NoteForm = { text: '', cost_centers: [], categories: [], merchants: '', expires_on: '' }

export function formFromNote(note: Note): NoteForm {
  return { text: note.text, cost_centers: note.cost_centers, categories: note.categories, merchants: note.merchants.join(', '), expires_on: note.expires_on ?? '' }
}

export function noteProblem(form: NoteForm): string | null {
  if (!form.text.trim()) return 'Write the note.'
  const merchants = form.merchants.split(',').map((m) => m.trim()).filter(Boolean)
  if (!form.cost_centers.length && !form.categories.length && !merchants.length) return 'Link the note to a person or thing, a category or a merchant, so the assistant knows when it matters.'
  return null
}

export function noteBody(form: NoteForm, personal: boolean) {
  return {
    text: form.text.trim(),
    personal,
    cost_centers: form.cost_centers,
    categories: form.categories,
    merchants: form.merchants.split(',').map((m) => m.trim()).filter(Boolean),
    expires_on: form.expires_on || null,
  }
}
