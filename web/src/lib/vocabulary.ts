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

export function noteBody(text: string): { text: string } | null {
  return text.trim() ? { text: text.trim() } : null
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
