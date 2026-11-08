import type { z } from 'zod'
import { MAX_PAGE } from '../api/common.js'
import type { Export } from '../api/export.js'
import type { Tx } from '../db/db.js'
import { listCaps } from './caps.js'
import type { Caller } from './caller.js'
import { getNotes } from './notes.js'
import { repeatsForExport } from './repeats.js'
import { loadViews, type TransactionView } from './transactions.js'
import { listWatches } from './watches.js'

// A member's own data, to download (VISION.md §4.C). Each read keeps to the caller, as it does for the rest of the API.

// Every purchase, newest first, loaded in pages so a long history stays within one query's limits.
export async function allPurchases(tx: Tx, caller: Caller): Promise<(TransactionView & { created_via: string | null })[]> {
  const rows = await tx.selectFrom('transactions').select(['id', 'created_via']).where('spent_by', '=', caller.user_id).orderBy('date', 'desc').orderBy('created_at', 'desc').execute()
  const via = new Map(rows.map((r) => [r.id, r.created_via]))
  const purchases: (TransactionView & { created_via: string | null })[] = []
  for (let start = 0; start < rows.length; start += MAX_PAGE) {
    const views = await loadViews(tx, caller, rows.slice(start, start + MAX_PAGE).map((r) => r.id))
    purchases.push(...views.map((view) => ({ ...view, created_via: via.get(view.id) ?? null })))
  }
  return purchases
}

async function exportedNotes(tx: Tx, caller: Caller) {
  const via = new Map((await tx.selectFrom('notes').select(['id', 'created_via']).where('user_id', '=', caller.user_id).execute()).map((r) => [r.id, r.created_via]))
  return (await getNotes(tx, caller)).map((note) => ({ ...note, created_via: via.get(note.id) ?? null }))
}

export async function exportData(tx: Tx, caller: Caller, now = new Date()): Promise<z.input<typeof Export>> {
  const member = await tx.selectFrom('users').select(['name', 'email']).where('id', '=', caller.user_id).executeTakeFirstOrThrow()
  return {
    exported_at: now.toISOString(),
    member,
    currency: caller.currency,
    purchases: await allPurchases(tx, caller),
    notes: await exportedNotes(tx, caller),
    watches: await listWatches(tx, caller),
    caps: await listCaps(tx, caller, now),
    repeats: await repeatsForExport(tx, caller),
  }
}
