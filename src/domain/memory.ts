import type { Problem } from './renames.js'

// A member's watched groups (VISION.md §3.3).

export type WatchInput = { category: string } | { item: string }

// A watched group is a category or an item, never both.
export function watchInput(input: { category?: string | null; item?: string | null }): WatchInput | Problem {
  const category = input.category?.trim()
  const item = input.item?.trim()
  if (Boolean(category) === Boolean(item)) return { code: 'invalid_watch', message: 'Watch a category or an item, one of the two.' }
  return category ? { category } : { item: item! }
}
