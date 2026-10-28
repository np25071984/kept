import type { Tx } from '../db/db.js'
import { isLocalDate, todayIn } from '../domain/dates.js'
import { normalizeMerchant } from '../domain/merchants.js'
import type { Caller } from './caller.js'
import { invalid, notFound } from './errors.js'
import { loadVocabulary, type Vocabulary } from './vocabulary.js'

// Household notes, the agent's shared memory (VISION.md §4.A, "Household Notes").

export interface NoteView {
  id: string
  text: string
  personal: boolean
  cost_centers: string[]
  categories: string[]
  merchants: string[]
  expires_on: string | null
  expired: boolean
  created_at: string
}

export interface NoteQuery {
  cost_center?: string
  category?: string
  merchant?: string
  q?: string
  include_expired?: boolean
}

export async function getNotes(tx: Tx, caller: Caller, query: NoteQuery, now = new Date()): Promise<NoteView[]> {
  const today = todayIn(caller.timezone, now)
  const notes = await loadNotes(tx, caller, today)
  return notes.filter((note) => {
    if (note.expired && !query.include_expired) return false
    const linked = [
      query.cost_center && note.cost_centers.some((c) => c.toLowerCase() === query.cost_center!.toLowerCase()),
      query.category && note.categories.some((c) => query.category!.toLowerCase() === c.toLowerCase() || query.category!.toLowerCase().startsWith(`${c.toLowerCase()}/`)),
      query.merchant && note.merchants.some((m) => normalizeMerchant(m) === normalizeMerchant(query.merchant!)),
      query.q && note.text.toLowerCase().includes(query.q.toLowerCase()),
    ]
    const filtered = query.cost_center || query.category || query.merchant || query.q
    return !filtered || linked.some(Boolean)
  })
}

async function loadNotes(tx: Tx, caller: Caller, today: string): Promise<NoteView[]> {
  const rows = await tx
    .selectFrom('notes')
    .select(['id', 'text', 'user_id', 'merchants', 'expires_on', 'created_at'])
    .where((eb) => eb.or([eb('user_id', 'is', null), eb('user_id', '=', caller.user_id)]))
    .orderBy('created_at', 'desc')
    .execute()
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [centers, categories] = await Promise.all([
    tx.selectFrom('note_cost_centers').innerJoin('cost_centers', 'cost_centers.id', 'note_cost_centers.cost_center_id').select(['note_id', 'cost_centers.name']).where('note_id', 'in', ids).execute(),
    tx.selectFrom('note_categories').innerJoin('categories', 'categories.id', 'note_categories.category_id').select(['note_id', 'categories.path']).where('note_id', 'in', ids).execute(),
  ])
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    personal: row.user_id != null,
    cost_centers: centers.filter((c) => c.note_id === row.id).map((c) => c.name),
    categories: categories.filter((c) => c.note_id === row.id).map((c) => c.path),
    merchants: row.merchants,
    expires_on: row.expires_on,
    expired: row.expires_on != null && row.expires_on < today,
    created_at: new Date(row.created_at).toISOString(),
  }))
}

export interface NoteBody {
  text?: string
  personal?: boolean
  cost_centers?: string[]
  categories?: string[]
  merchants?: string[]
  expires_on?: string | null
}

export async function saveNote(tx: Tx, caller: Caller, body: NoteBody & { text: string }): Promise<NoteView> {
  const vocabulary = await loadVocabulary(tx)
  const links = resolveLinks(vocabulary, body)
  if (links.costCenterIds.length + links.categoryIds.length + links.merchants.length === 0) {
    throw invalid('note_needs_link', 'A note links to at least one cost center, category or merchant.')
  }
  checkExpiry(body.expires_on)
  const { id } = await tx
    .insertInto('notes')
    .values({ household_id: caller.household_id, text: body.text, user_id: body.personal ? caller.user_id : null, merchants: links.merchants, expires_on: body.expires_on ?? null, created_by: caller.user_id })
    .returning('id')
    .executeTakeFirstOrThrow()
  await writeLinks(tx, caller, id, links)
  return findNote(tx, caller, id)
}

export async function updateNote(tx: Tx, caller: Caller, id: string, body: NoteBody): Promise<NoteView> {
  await editable(tx, caller, id)
  const vocabulary = await loadVocabulary(tx)
  checkExpiry(body.expires_on)
  const current = await findNote(tx, caller, id)
  const links = resolveLinks(vocabulary, {
    cost_centers: body.cost_centers ?? current.cost_centers,
    categories: body.categories ?? current.categories,
    merchants: body.merchants ?? current.merchants,
  })
  if (links.costCenterIds.length + links.categoryIds.length + links.merchants.length === 0) {
    throw invalid('note_needs_link', 'A note links to at least one cost center, category or merchant.')
  }
  await tx
    .updateTable('notes')
    .set({
      merchants: links.merchants,
      updated_at: new Date(),
      ...(body.text !== undefined && { text: body.text }),
      ...(body.expires_on !== undefined && { expires_on: body.expires_on }),
    })
    .where('id', '=', id)
    .execute()
  await tx.deleteFrom('note_cost_centers').where('note_id', '=', id).execute()
  await tx.deleteFrom('note_categories').where('note_id', '=', id).execute()
  await writeLinks(tx, caller, id, links)
  return findNote(tx, caller, id)
}

export async function deleteNote(tx: Tx, caller: Caller, id: string): Promise<void> {
  await editable(tx, caller, id)
  await tx.deleteFrom('notes').where('id', '=', id).execute()
}

// Any member may change a household-wide note; a personal note is invisible to everyone but its owner.
async function editable(tx: Tx, caller: Caller, id: string) {
  const note = await tx.selectFrom('notes').select('user_id').where('id', '=', id).executeTakeFirst()
  if (!note || (note.user_id && note.user_id !== caller.user_id)) throw notFound('Note')
}

async function findNote(tx: Tx, caller: Caller, id: string): Promise<NoteView> {
  const note = (await loadNotes(tx, caller, todayIn(caller.timezone, new Date()))).find((n) => n.id === id)
  if (!note) throw notFound('Note')
  return note
}

function resolveLinks(vocabulary: Vocabulary, body: NoteBody) {
  return {
    costCenterIds: [...new Set((body.cost_centers ?? []).map((name) => vocabulary.costCenterId(name)))],
    categoryIds: [...new Set((body.categories ?? []).map((path) => vocabulary.categoryId(path)))],
    merchants: [...new Set((body.merchants ?? []).map((m) => m.trim()).filter(Boolean))],
  }
}

async function writeLinks(tx: Tx, caller: Caller, noteId: string, links: ReturnType<typeof resolveLinks>) {
  if (links.costCenterIds.length) await tx.insertInto('note_cost_centers').values(links.costCenterIds.map((cost_center_id) => ({ household_id: caller.household_id, note_id: noteId, cost_center_id }))).execute()
  if (links.categoryIds.length) await tx.insertInto('note_categories').values(links.categoryIds.map((category_id) => ({ household_id: caller.household_id, note_id: noteId, category_id }))).execute()
}

function checkExpiry(expiresOn: string | null | undefined) {
  if (expiresOn && !isLocalDate(expiresOn)) throw invalid('invalid_date', 'expires_on must be YYYY-MM-DD.')
}