import { useState, type FormEvent } from 'react'
import { api } from '../api.js'
import type { CostCenter } from '../lib/types.js'
import { categoryTree } from '../lib/vocabulary.js'
import { useAction, useSession } from '../session.js'
import { MultiSelect, NotesSection, RulesSection } from './RulesAndNotes.js'

// The household's shared vocabulary, rules and notes (VISION.md §4.C, "Household").
export function HouseholdPage() {
  const { setup } = useSession()
  return (
    <>
      <div className="page-head">
        <h1>{setup.household.name}</h1>
        <p className="muted">Shared by everyone in the household · {setup.household.currency}</p>
      </div>
      <Categories />
      <CostCenters />
      <RulesSection personal={false} />
      <NotesSection personal={false} />
    </>
  )
}

function Categories() {
  const { categories, refreshVocabulary } = useSession()
  const [path, setPath] = useState('')
  const { busy, error, act } = useAction()
  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (await act(() => api.addCategory(path.trim()))) {
      setPath('')
      refreshVocabulary()
    }
  }
  return (
    <section className="section">
      <h2>Categories</h2>
      <p className="muted small">Up to three levels, like Car/Fuel/Diesel. Renaming keeps every purchase in it; a category can be deleted once nothing uses it.</p>
      <ul className="list">
        {categoryTree(categories).map((row) => <CategoryRow key={row.path} path={row.path} name={row.name} depth={row.depth} />)}
      </ul>
      <form className="row" onSubmit={add}>
        <input className="grow" value={path} onChange={(e) => setPath(e.target.value)} placeholder="New category, e.g. Car/Parking" aria-label="New category" />
        <button type="submit" disabled={busy || !path.trim()}>Add</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function CategoryRow({ path, name, depth }: { path: string; name: string; depth: number }) {
  const { refreshVocabulary } = useSession()
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view')
  const [newPath, setNewPath] = useState(path)
  const { busy, error, act, clearError } = useAction()
  const done = () => {
    setMode('view')
    refreshVocabulary()
  }
  return (
    <li className={`list-row depth-${depth}`}>
      {mode === 'rename' ? (
        <form className="row tight grow" onSubmit={(e) => { e.preventDefault(); void act(() => api.renameCategory(path, newPath.trim())).then((ok) => ok && done()) }}>
          <input className="grow" value={newPath} onChange={(e) => setNewPath(e.target.value)} aria-label={`New path for ${path}`} autoFocus />
          <button type="submit" className="primary" disabled={busy}>Rename</button>
          <button type="button" onClick={() => { setMode('view'); setNewPath(path); clearError() }}>Cancel</button>
        </form>
      ) : (
        <span className="grow">{name}</span>
      )}
      {mode === 'delete' && (
        <div className="row tight">
          <span className="muted small">Delete {path}?</span>
          <button className="danger" disabled={busy} onClick={() => void act(() => api.deleteCategory(path)).then((ok) => ok && done())}>Delete</button>
          <button onClick={() => { setMode('view'); clearError() }}>Keep</button>
        </div>
      )}
      {mode === 'view' && (
        <div className="row tight">
          <button className="link" onClick={() => setMode('rename')}>Rename</button>
          <button className="link" onClick={() => setMode('delete')}>Delete</button>
        </div>
      )}
      {error && <p className="error full">{error}</p>}
    </li>
  )
}

function CostCenters() {
  const { costCenters } = useSession()
  const [adding, setAdding] = useState(false)
  return (
    <section className="section">
      <div className="section-head">
        <h2>Cost centers</h2>
        {!adding && <button onClick={() => setAdding(true)}>Add a cost center</button>}
      </div>
      <p className="muted small">The people, cars, homes and projects money is spent for. Linked categories tell your assistant when to ask which one.</p>
      {adding && <CostCenterEditor onDone={() => setAdding(false)} />}
      <ul className="list">
        {costCenters.map((cc) => <CostCenterRow key={cc.name} cc={cc} />)}
      </ul>
    </section>
  )
}

function CostCenterRow({ cc }: { cc: CostCenter }) {
  const { refreshVocabulary } = useSession()
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const { busy, error, act, clearError } = useAction()
  if (mode === 'edit') return <li className="list-row"><CostCenterEditor cc={cc} onDone={() => setMode('view')} /></li>
  return (
    <li className="list-row">
      <div className="grow">
        <div><strong>{cc.name}</strong> <span className="muted small">· {cc.kind}</span></div>
        {cc.categories.length > 0 && <div className="tags">{cc.categories.map((c) => <span key={c} className="tag">{c}</span>)}</div>}
      </div>
      {mode === 'delete' ? (
        <div className="row tight">
          <button className="danger" disabled={busy} onClick={() => void act(() => api.deleteCostCenter(cc.name)).then((ok) => ok && (setMode('view'), refreshVocabulary()))}>Delete {cc.name}</button>
          <button onClick={() => { setMode('view'); clearError() }}>Keep</button>
        </div>
      ) : (
        <div className="row tight">
          <button className="link" onClick={() => setMode('edit')}>Edit</button>
          <button className="link" onClick={() => setMode('delete')}>Delete</button>
        </div>
      )}
      {error && <p className="error full">{error}</p>}
    </li>
  )
}

function CostCenterEditor({ cc, onDone }: { cc?: CostCenter; onDone: () => void }) {
  const { categories, refreshVocabulary } = useSession()
  const [form, setForm] = useState({ name: cc?.name ?? '', kind: cc?.kind ?? '', categories: cc?.categories ?? [] })
  const { busy, error, act } = useAction()
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const body = { name: form.name.trim(), kind: form.kind.trim(), categories: form.categories }
    const ok = await act(() =>
      cc ? api.updateCostCenter(cc.name, { ...(body.name !== cc.name && { new_name: body.name }), kind: body.kind, categories: body.categories }) : api.addCostCenter(body),
    )
    if (ok) {
      refreshVocabulary()
      onDone()
    }
  }
  return (
    <form className="panel editor grow" onSubmit={save}>
      <div className="grid">
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kia" required /></label>
        <label>Kind
          <input list="cost-center-kinds" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} placeholder="Car, Child, Pet…" required />
          <datalist id="cost-center-kinds">{['Car', 'Child', 'Home', 'Pet', 'Project', 'Person'].map((k) => <option key={k} value={k} />)}</datalist>
        </label>
      </div>
      <label>Linked categories<MultiSelect options={categories} value={form.categories} onChange={(linked) => setForm({ ...form, categories: linked })} /></label>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !form.name.trim() || !form.kind.trim()}>{cc ? 'Save' : 'Add'}</button>
        <button type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}
