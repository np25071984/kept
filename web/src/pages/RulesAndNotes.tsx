import { useState } from 'react'
import { api } from '../api.js'
import { formatDate } from '../lib/money.js'
import type { Note, Rule } from '../lib/types.js'
import { emptyNote, formFromNote, noteBody, noteProblem, ruleKindLabel, ruleScope, type NoteForm } from '../lib/vocabulary.js'
import { useAction, useLoad, useSession } from '../session.js'

// Rules and notes, household-wide on the Household page and personal on the Me page (VISION.md §4.A, "Rules", "Notes").

export function RulesSection({ personal }: { personal: boolean }) {
  const rules = useLoad(() => api.rules(), [])
  const shown = (rules.data ?? []).filter((rule) => rule.personal === personal)
  return (
    <section className="section">
      <h2>{personal ? 'My rules' : 'Household rules'}</h2>
      <p className="muted small">
        {personal ? 'Rules only for your purchases, such as keeping a store private.' : 'Rules for everyone\'s purchases.'} Your assistant saves them when you tell it, like "Costco is always groceries".
      </p>
      {rules.error && <p className="error">{rules.error}</p>}
      {rules.data && shown.length === 0 && <p className="muted">No rules yet.</p>}
      <ul className="list">
        {shown.map((rule) => <RuleRow key={rule.id} rule={rule} onDeleted={rules.reload} />)}
      </ul>
    </section>
  )
}

function RuleRow({ rule, onDeleted }: { rule: Rule; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const { busy, error, act } = useAction()
  return (
    <li className="list-row">
      <div className="grow">
        <div>{rule.text}</div>
        <div className="muted small">{ruleKindLabel(rule)} · {ruleScope(rule)}</div>
        {error && <p className="error">{error}</p>}
      </div>
      {confirming ? (
        <div className="row tight">
          <button className="danger" disabled={busy} onClick={() => act(async () => { await api.deleteRule(rule.id); onDeleted() })}>Delete rule</button>
          <button onClick={() => setConfirming(false)}>Keep</button>
        </div>
      ) : (
        <button className="link" onClick={() => setConfirming(true)}>Delete</button>
      )}
    </li>
  )
}

export function NotesSection({ personal }: { personal: boolean }) {
  const notes = useLoad(() => api.notes(), [])
  const [adding, setAdding] = useState(false)
  const shown = (notes.data ?? []).filter((note) => note.personal === personal)
  return (
    <section className="section">
      <div className="section-head">
        <h2>{personal ? 'My notes' : 'Household notes'}</h2>
        {!adding && <button onClick={() => setAdding(true)}>Add a note</button>}
      </div>
      <p className="muted small">Things your assistant should remember, brought up when a purchase touches what the note is linked to.</p>
      {notes.error && <p className="error">{notes.error}</p>}
      {adding && <NoteEditor personal={personal} onDone={(saved) => { setAdding(false); if (saved) notes.reload() }} />}
      {notes.data && shown.length === 0 && !adding && <p className="muted">No notes yet.</p>}
      <ul className="list">
        {shown.map((note) => <NoteRow key={note.id} note={note} onChanged={notes.reload} />)}
      </ul>
    </section>
  )
}

function NoteRow({ note, onChanged }: { note: Note; onChanged: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const { busy, error, act } = useAction()
  if (mode === 'edit') return <li className="list-row"><NoteEditor note={note} personal={note.personal} onDone={(saved) => { setMode('view'); if (saved) onChanged() }} /></li>
  const links = [...note.cost_centers, ...note.categories, ...note.merchants]
  return (
    <li className={`list-row${note.expired ? ' faded' : ''}`}>
      <div className="grow">
        <div>{note.text}</div>
        <div className="tags">
          {links.map((link) => <span key={link} className="tag">{link}</span>)}
          {note.expires_on && <span className="tag">{note.expired ? 'Expired' : 'Until'} {formatDate(note.expires_on)}</span>}
        </div>
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

function NoteEditor({ note, personal, onDone }: { note?: Note; personal: boolean; onDone: (saved: boolean) => void }) {
  const { categories, costCenters } = useSession()
  const [form, setForm] = useState<NoteForm>(note ? formFromNote(note) : emptyNote)
  const [problem, setProblem] = useState<string | null>(null)
  const { busy, error, act } = useAction()
  const save = async () => {
    const found = noteProblem(form)
    setProblem(found)
    if (found) return
    const body = noteBody(form, personal)
    if (await act(() => (note ? api.updateNote(note.id, body) : api.addNote(body)))) onDone(true)
  }
  return (
    <form className="panel editor grow" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <label>Note<textarea rows={2} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="The Kia needs premium fuel" /></label>
      <div className="grid">
        <label>People &amp; things
          <MultiSelect options={costCenters.map((c) => c.name)} value={form.cost_centers} onChange={(cost_centers) => setForm({ ...form, cost_centers })} />
        </label>
        <label>Categories
          <MultiSelect options={categories} value={form.categories} onChange={(categories) => setForm({ ...form, categories })} />
        </label>
      </div>
      <div className="grid">
        <label>Merchants<input value={form.merchants} onChange={(e) => setForm({ ...form, merchants: e.target.value })} placeholder="Comma-separated, e.g. Shell, Costco" /></label>
        <label>Until (optional)<input type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} /></label>
      </div>
      {[problem, error].filter(Boolean).map((p) => <p key={p} className="error">{p}</p>)}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy}>Save note</button>
        <button type="button" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  )
}

export function MultiSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (value: string[]) => void }) {
  const rest = options.filter((option) => !value.includes(option))
  return (
    <span className="spent-for">
      {value.map((item) => (
        <span key={item} className="chip">
          {item}
          <button type="button" className="link" aria-label={`Remove ${item}`} onClick={() => onChange(value.filter((v) => v !== item))}>×</button>
        </span>
      ))}
      {rest.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
          <option value="">{value.length ? 'Add…' : 'None'}</option>
          {rest.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      )}
    </span>
  )
}
