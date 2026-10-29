import type { Tx } from '../db/db.js'
import type { Caller } from './caller.js'
import { notFound } from './errors.js'

// The caller's notes, what their assistants remember (VISION.md §4.A, "Notes"). Nobody else sees them.

export interface NoteView {
  id: string
  text: string
  created_at: string
}

export async function getNotes(tx: Tx, caller: Caller): Promise<NoteView[]> {
  const rows = await tx.selectFrom('notes').select(['id', 'text', 'created_at']).where('user_id', '=', caller.user_id).orderBy('created_at', 'desc').execute()
  return rows.map((row) => ({ ...row, created_at: new Date(row.created_at).toISOString() }))
}

export async function saveNote(tx: Tx, caller: Caller, text: string): Promise<NoteView> {
  const row = await tx
    .insertInto('notes')
    .values({ household_id: caller.household_id, user_id: caller.user_id, text: text.trim() })
    .returning(['id', 'text', 'created_at'])
    .executeTakeFirstOrThrow()
  return { ...row, created_at: new Date(row.created_at).toISOString() }
}

export async function updateNote(tx: Tx, caller: Caller, id: string, text: string): Promise<NoteView> {
  const row = await tx
    .updateTable('notes')
    .set({ text: text.trim(), updated_at: new Date() })
    .where('id', '=', id)
    .where('user_id', '=', caller.user_id)
    .returning(['id', 'text', 'created_at'])
    .executeTakeFirst()
  if (!row) throw notFound('Note')
  return { ...row, created_at: new Date(row.created_at).toISOString() }
}

export async function deleteNote(tx: Tx, caller: Caller, id: string): Promise<void> {
  const deleted = await tx.deleteFrom('notes').where('id', '=', id).where('user_id', '=', caller.user_id).executeTakeFirst()
  if (deleted.numDeletedRows === 0n) throw notFound('Note')
}
