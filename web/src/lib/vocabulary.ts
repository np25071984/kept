import type { Note } from './types.js'

// Categories as a tree, and the note and watch forms (VISION.md §4.C, "Household" and "Me").

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

export interface NoteForm {
  text: string
  expires_on: string
}

export const emptyNote: NoteForm = { text: '', expires_on: '' }

export function formFromNote(note: Note): NoteForm {
  return { text: note.text, expires_on: note.expires_on ?? '' }
}

export function noteBody(form: NoteForm): { text: string; expires_on: string | null } | null {
  const text = form.text.trim()
  return text ? { text, expires_on: form.expires_on || null } : null
}

// A category picked from the list, or an item typed in.
export interface WatchForm {
  category: string
  item: string
}

export function watchBody(form: WatchForm): { category: string } | { item: string } | null {
  if (form.category) return { category: form.category }
  const item = form.item.trim()
  return item ? { item } : null
}
