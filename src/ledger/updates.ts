import type { Tx } from '../db/db.js'
import type { Caller } from './caller.js'

// What the ledger did on its own, for the agent to announce (VISION.md §3.5, "What happens on the date").

export async function getUpdates(tx: Tx, caller: Caller, includeSeen = false) {
  const rows = await tx
    .selectFrom('updates')
    .select(['id', 'kind', 'text', 'transaction_id', 'other_transaction_id', 'created_at', 'seen_at'])
    .where('user_id', '=', caller.user_id)
    .$if(!includeSeen, (q) => q.where('seen_at', 'is', null))
    .orderBy('created_at')
    .execute()
  return rows.map((row) => ({
    ...row,
    created_at: new Date(row.created_at).toISOString(),
    seen_at: row.seen_at ? new Date(row.seen_at).toISOString() : null,
  }))
}

// Returns the unseen updates and marks them seen in one transaction, for an agent that announces them once.
export async function takeUpdates(tx: Tx, caller: Caller) {
  const updates = await getUpdates(tx, caller)
  await markSeen(tx, caller, updates.map((u) => u.id))
  return updates
}

export async function markSeen(tx: Tx, caller: Caller, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const rows = await tx
    .updateTable('updates')
    .set({ seen_at: new Date() })
    .where('user_id', '=', caller.user_id)
    .where('id', 'in', ids)
    .where('seen_at', 'is', null)
    .returning('id')
    .execute()
  return rows.length
}