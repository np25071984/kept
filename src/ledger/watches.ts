import type { Tx } from '../db/db.js'
import { groupKey, uniqueGroups, type WatchedGroup } from '../domain/coverage.js'
import { watchInput } from '../domain/memory.js'
import type { Caller } from './caller.js'
import { invalid, notFound } from './errors.js'
import { loadVocabulary } from './vocabulary.js'

// The caller's watched groups (VISION.md §3.3). Nobody else sees them.

export interface WatchView {
  id: string
  category: string | null
  item: string | null
  group: string
}

export async function listWatches(tx: Tx, caller: Caller): Promise<WatchView[]> {
  const rows = await tx
    .selectFrom('watches')
    .leftJoin('categories', 'categories.id', 'watches.category_id')
    .select(['watches.id', 'categories.path', 'watches.item'])
    .where('watches.user_id', '=', caller.user_id)
    .orderBy('watches.created_at')
    .execute()
  return rows.map((row) => ({ id: row.id, category: row.path ?? null, item: row.item, group: row.path ?? row.item! }))
}

export async function watchedGroups(tx: Tx, caller: Caller): Promise<WatchedGroup[]> {
  const watches = await listWatches(tx, caller)
  return uniqueGroups(watches.map((w): WatchedGroup => (w.category ? { kind: 'category', path: w.category } : { kind: 'item', item: w.item! })))
}

// Watching a group already watched returns the existing one.
export async function addWatch(tx: Tx, caller: Caller, body: { category?: string | null; item?: string | null }): Promise<WatchView> {
  const input = watchInput(body)
  if ('code' in input) throw invalid(input.code, input.message)
  const vocabulary = await loadVocabulary(tx)
  const categoryId = 'category' in input ? vocabulary.categoryId(input.category) : null
  const key = 'category' in input ? vocabulary.categoryPath(categoryId!) : input.item
  const existing = (await listWatches(tx, caller)).find((w) => w.group.toLowerCase() === key.toLowerCase())
  if (existing) return existing
  const { id } = await tx
    .insertInto('watches')
    .values({ household_id: caller.household_id, user_id: caller.user_id, category_id: categoryId, item: 'item' in input ? input.item : null })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id, category: categoryId ? key : null, item: 'item' in input ? input.item : null, group: groupKey(categoryId ? { kind: 'category', path: key } : { kind: 'item', item: key }) }
}

export async function deleteWatch(tx: Tx, caller: Caller, id: string): Promise<void> {
  const deleted = await tx.deleteFrom('watches').where('id', '=', id).where('user_id', '=', caller.user_id).executeTakeFirst()
  if (deleted.numDeletedRows === 0n) throw notFound('Watched group')
}
