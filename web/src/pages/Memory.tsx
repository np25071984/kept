import { useState } from 'react'
import { api } from '../api.js'
import type { Note, Watch } from '../lib/types.js'
import { noteBody, watchBody, type WatchForm } from '../lib/vocabulary.js'
import { useAction, useLoad, useSession } from '../session.js'

// What the member's assistants remember: watched groups and notes, seen by nobody else (VISION.md §4.A, "Notes"; §3.3).

export function WatchingSection() {
  const watches = useLoad(() => api.watches(), [])
  const [adding, setAdding] = useState(false)
  return (
    <section className="section">
      <div className="section-head">
        <h2>Watching</h2>
        {!adding && <button onClick={() => setAdding(true)}>Watch something</button>}
      </div>
      <p className="muted small">Your assistant asks about these where they're bought.</p>
      {watches.error && <p className="error">{watches.error}</p>}
      {adding && <WatchEditor onDone={(saved) => { setAdding(false); if (saved) watches.reload() }} />}
      {watches.data && watches.data.length === 0 && !adding && <p className="muted">Nothing watched yet.</p>}
      <ul className="list">
        {(watches.data ?? []).map((watch) => <WatchRow key={watch.id} watch={watch} onChanged={watches.reload} />)}
      </ul>
    </section>
  )
}

function WatchRow({ watch, onChanged }: { watch: Watch; onChanged: () => void }) {
  const { busy, error, act } = useAction()
  return (
    <li className="list-row">
      <div className="grow">
        <div>{watch.category ? watch.category.split('/').at(-1) : watch.item}</div>
        <div className="muted small">{watch.category ? `Category ${watch.category}` : 'Item'}</div>
        {error && <p className="error">{error}</p>}
      </div>
      <button className="link" disabled={busy} onClick={() => act(async () => { await api.stopWatching(watch.id); onChanged() })}>Stop watching</button>
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
        <label>A category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">An item instead</option>
            {categories.map((path) => <option key={path} value={path}>{path}</option>)}
          </select>
        </label>
        {!form.category && <label>Item<input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="snacks" /></label>}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !body}>Watch</button>
        <button type="button" onClick={() => onDone(false)}>Cancel</button>
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
        <h2>Notes</h2>
        {!adding && <button onClick={() => setAdding(true)}>Add a note</button>}
      </div>
      <p className="muted small">What your assistants remember about your spending, in your words. They read every note before asking anything.</p>
      {notes.error && <p className="error">{notes.error}</p>}
      {adding && <NoteEditor onDone={(saved) => { setAdding(false); if (saved) notes.reload() }} />}
      {notes.data && notes.data.length === 0 && !adding && <p className="muted">No notes yet.</p>}
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
        <div className="muted small">Saved {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        {error && <p className="error">{error}</p>}
      </div>
      {mode === 'delete' ? (
        <div className="row tight">
          <button className="danger" disabled={busy} onClick={() => act(async () => { await api.deleteNote(note.id); onChanged() })}>Delete note</button>
          <button onClick={() => setMode('view')}>Keep</button>
        </div>
      ) : (
        <div className="row tight">
          <button className="link" onClick={() => setMode('edit')}>Edit</button>
          <button className="link" onClick={() => setMode('delete')}>Delete</button>
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
      <label>Note<textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Costco is always groceries" /></label>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !body}>Save note</button>
        <button type="button" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  )
}
