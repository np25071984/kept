import { locale } from '../i18n.js'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.js'
import { formatMoney } from '../lib/money.js'
import { IconButton } from '../IconButton.js'
import type { Note, Watch } from '../lib/types.js'
import { noteBody, watchBody, type WatchForm } from '../lib/vocabulary.js'
import { useAction, useLoad, useSession } from '../session.js'
import { t } from '../i18n.js'

// What the member's assistants remember: watched groups and notes, seen by nobody else (VISION.md §4.A, "Notes"; §3.3).

export function WatchingSection() {
  const watches = useLoad(() => api.watches(), [])
  // This month's amount found and coverage per group (VISION.md §4.A, "Coverage").
  const month = useLoad(() => api.summary({ scope: 'me' }), [watches.data])
  const [adding, setAdding] = useState(false)
  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('Watching')}</h2>
        {!adding && <button onClick={() => setAdding(true)}>{t('Watch something')}</button>}
      </div>
      <p className="muted small">{t('Your assistant asks about these where they\'re bought.')}</p>
      {watches.error && <p className="error">{watches.error}</p>}
      {adding && <WatchEditor onDone={(saved) => { setAdding(false); if (saved) watches.reload() }} />}
      {watches.data && watches.data.length === 0 && !adding && <p className="muted">{t('Nothing watched yet.')}</p>}
      <ul className="list">
        {(watches.data ?? []).map((watch) => <WatchRow key={watch.id} watch={watch} found={month.data?.watched.find((w) => w.group.toLowerCase() === watch.group.toLowerCase())} onChanged={watches.reload} />)}
      </ul>
    </section>
  )
}

function WatchRow({ watch, found, onChanged }: { watch: Watch; found?: { total: number; checked_share: number | null; estimate: number | null }; onChanged: () => void }) {
  const { setup } = useSession()
  const { busy, error, act } = useAction()
  const money = (n: number) => formatMoney(n, setup.household.currency)
  const share = found?.checked_share
  return (
    <li className="list-row">
      <div className="grow">
        <div className="row tight" style={{ justifyContent: 'space-between' }}>
          <span>{watch.category ? watch.category.split('/').at(-1) : watch.item}</span>
          {found && <span className="num"><strong>{share != null && share < 0.9 && found.estimate != null ? t('about ') : ''}{money(found.total)}</strong> <span className="small muted">{t('this month')}</span></span>}
        </div>
        <div className="muted small">{watch.category ? t('Category {path}', { path: watch.category }) : t('Item')}</div>
        {found && share != null && (
          <>
            <div className="meter"><span style={{ width: `${Math.round(share * 100)}%` }} /></div>
            <div className="small muted">{t("Checked in {pct}% of the spending where it's bought", { pct: Math.round(share * 100) })}{found.estimate != null && share < 1 ? t(' · about {amount} with the rest', { amount: money(found.estimate) }) : ''}</div>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
      <button className="link" disabled={busy} onClick={() => act(async () => { await api.stopWatching(watch.id); onChanged() })}>{t('Stop watching')}</button>
    </li>
  )
}

function WatchEditor({ onDone }: { onDone: (saved: boolean) => void }) {
  const { categories } = useSession()
  const [form, setForm] = useState<WatchForm>({ category: '', item: '' })
  const { busy, error, act } = useAction()
  const body = watchBody(form)
  const save = async () => {
    if (body && await act(() => api.watch(body))) onDone(true)
  }
  return (
    <form className="panel editor" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <div className="grid">
        <label>{t('A category')}
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">{t('An item instead')}</option>
            {categories.map((path) => <option key={path} value={path}>{path}</option>)}
          </select>
        </label>
        {!form.category && <label>{t('Item')}<input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder={t('snacks')} /></label>}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !body}>{t('Watch')}</button>
        <button type="button" onClick={() => onDone(false)}>{t('Cancel')}</button>
      </div>
    </form>
  )
}

export function NotesSection() {
  const notes = useLoad(() => api.notes(), [])
  const [adding, setAdding] = useState(false)
  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('Assistant notes')}</h2>
        {!adding && <button onClick={() => setAdding(true)}>{t('Add a note')}</button>}
      </div>
      <p className="muted small">{t('What your assistants remember about your spending, in your words. They read every note before asking anything.')}</p>
      {notes.error && <p className="error">{notes.error}</p>}
      {adding && <NoteEditor onDone={(saved) => { setAdding(false); if (saved) notes.reload() }} />}
      {notes.data && notes.data.length === 0 && !adding && <p className="muted">{t('No notes yet.')}</p>}
      <ul className="list">
        {(notes.data ?? []).map((note) => <NoteRow key={note.id} note={note} onChanged={notes.reload} />)}
      </ul>
    </section>
  )
}

function NoteRow({ note, onChanged }: { note: Note; onChanged: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const { busy, error, act } = useAction()
  if (mode === 'edit') return <li className="list-row"><NoteEditor note={note} onDone={(saved) => { setMode('view'); if (saved) onChanged() }} /></li>
  return (
    <li className="list-row">
      <div className="grow">
        <div>{note.text}</div>
        <div className="muted small">{t('Saved {date}', { date: new Date(note.created_at).toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' }) })}</div>
        {error && <p className="error">{error}</p>}
      </div>
      {mode === 'delete' ? (
        <div className="row tight">
          <button className="danger" disabled={busy} onClick={() => act(async () => { await api.deleteNote(note.id); onChanged() })}>{t('Delete note')}</button>
          <button onClick={() => setMode('view')}>{t('Keep')}</button>
        </div>
      ) : (
        <div className="row tight">
          <IconButton icon={Pencil} label={t('Edit note')} onClick={() => setMode('edit')} />
          <IconButton icon={Trash2} label={t('Delete note')} danger onClick={() => setMode('delete')} />
        </div>
      )}
    </li>
  )
}

function NoteEditor({ note, onDone }: { note?: Note; onDone: (saved: boolean) => void }) {
  const [text, setText] = useState(note?.text ?? '')
  const { busy, error, act } = useAction()
  const body = noteBody(text)
  const save = async () => {
    if (body && await act(() => (note ? api.updateNote(note.id, body) : api.addNote(body)))) onDone(true)
  }
  return (
    <form className="panel editor grow" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <label>{t('Note')}<textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Costco is always groceries')} /></label>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !body}>{t('Save note')}</button>
        <button type="button" onClick={() => onDone(false)}>{t('Cancel')}</button>
      </div>
    </form>
  )
}
