import type { Tx } from '../db/db.js'
import { isLocalDate, todayIn } from '../domain/dates.js'
import { isExpired } from '../domain/memory.js'
import type { Caller } from './caller.js'
import { invalid, notFound } from './errors.js'

// The caller's notes, what their assistants remember (VISION.md §4.A, "Notes"). Nobody else sees them.

export interface NoteView {
  id: string
  text: string
  expires_on: string | null
  expired: boolean
  created_at: string
}

export async function getNotes(tx: Tx, caller: Caller, includeExpired = false, now = new Date()): Promise<NoteView[]> {
  const today = todayIn(caller.timezone, now)
  const rows = await tx
    .selectFrom('notes')
    .select(['id', 'text', 'expires_on', 'created_at'])
    .where('user_id', '=', caller.user_id)
    .orderBy('created_at', 'desc')
    .execute()
  return rows
    .map((row) => ({ ...row, expired: isExpired(row.expires_on, today), created_at: new Date(row.created_at).toISOString() }))
    .filter((note) => includeExpired || !note.expired)
}

export interface NoteBody {
  text?: string
  expires_on?: string | null
}

export async function saveNote(tx: Tx, caller: Caller, body: NoteBody & { text: string }): Promise<NoteView> {
  checkExpiry(body.expires_on)
  const { id } = await tx
    .insertInto('notes')
    .values({ household_id: caller.household_id, user_id: caller.user_id, text: body.text.trim(), expires_on: body.expires_on ?? null })
    .returning('id')
    .executeTakeFirstOrThrow()
  return findNote(tx, caller, id)
}

export async function updateNote(tx: Tx, caller: Caller, id: string, body: NoteBody): Promise<NoteView> {
  checkExpiry(body.expires_on)
  const updated = await tx
    .updateTable('notes')
    .set({
      updated_at: new Date(),
      ...(body.text !== undefined && { text: body.text.trim() }),
      ...(body.expires_on !== undefined && { expires_on: body.expires_on }),
    })
    .where('id', '=', id)
    .where('user_id', '=', caller.user_id)
    .executeTakeFirst()
  if (updated.numUpdatedRows === 0n) throw notFound('Note')
  return findNote(tx, caller, id)
}

export async function deleteNote(tx: Tx, caller: Caller, id: string): Promise<void> {
  const deleted = await tx.deleteFrom('notes').where('id', '=', id).where('user_id', '=', caller.user_id).executeTakeFirst()
  if (deleted.numDeletedRows === 0n) throw notFound('Note')
}

async function findNote(tx: Tx, caller: Caller, id: string): Promise<NoteView> {
  const note = (await getNotes(tx, caller, true)).find((n) => n.id === id)
  if (!note) throw notFound('Note')
  return note
}

function checkExpiry(expiresOn: string | null | undefined) {
  if (expiresOn && !isLocalDate(expiresOn)) throw invalid('invalid_date', 'expires_on must be YYYY-MM-DD.')
}
