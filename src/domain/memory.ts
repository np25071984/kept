import type { Problem } from './renames.js'

// A member's notes and watched groups (VISION.md §4.A, "Notes"; §3.3).

export function isExpired(expiresOn: string | null, today: string): boolean {
  return expiresOn != null && expiresOn < today
}

export type WatchInput = { category: string } | { item: string }

// A watched group is a category or an item, never both.
export function watchInput(input: { category?: string | null; item?: string | null }): WatchInput | Problem {
  const category = input.category?.trim()
  const item = input.item?.trim()
  if (Boolean(category) === Boolean(item)) return { code: 'invalid_watch', message: 'Watch a category or an item, one of the two.' }
  return category ? { category } : { item: item! }
}
