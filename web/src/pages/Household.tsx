import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api } from '../api.js'
import { IconButton } from '../IconButton.js'
import type { CostCenter } from '../lib/types.js'
import { categoryTree } from '../lib/vocabulary.js'
import { useAction, useSession } from '../session.js'

// Settings → Household → Categories (VISION.md §4.C): add, rename and delete in place; three levels at most.
export function CategoriesPage() {
  const { categories } = useSession()
  const [adding, setAdding] = useState(false)
  return (
    <section className="section">
      <div className="section-head">
        <p className="muted small" style={{ margin: 0 }}>Up to three levels. Renaming keeps every purchase in it; a category can be deleted once nothing uses it.</p>
        {!adding && <button onClick={() => setAdding(true)}>Add category</button>}
      </div>
      <ul className="list">
        {adding && <li className="list-row"><NewCategory parent={null} onDone={() => setAdding(false)} /></li>}
        {categoryTree(categories).map((row) => <CategoryRow key={row.path} path={row.path} name={row.name} depth={row.depth} />)}
      </ul>
    </section>
  )
}

// A field for a new category, top-level or under `parent`, so nobody types paths.
function NewCategory({ parent, onDone }: { parent: string | null; onDone: () => void }) {
  const { refreshVocabulary } = useSession()
  const [name, setName] = useState('')
  const { busy, error, act } = useAction()
  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (await act(() => api.addCategory(parent ? `${parent}/${name.trim()}` : name.trim()))) {
      refreshVocabulary()
      onDone()
    }
  }
  return (
    <form className="row tight grow" onSubmit={add}>
      <span className="muted small">{parent ? `New under ${parent}` : 'New category'}</span>
      <input className="grow" value={name} onChange={(e) => setName(e.target.value)} aria-label={parent ? `New category under ${parent}` : 'New category'} autoFocus style={{ maxWidth: 260 }} />
      <button type="submit" className="primary" disabled={busy || !name.trim() || name.includes('/')}>Add</button>
      <button type="button" onClick={onDone}>Cancel</button>
      {error && <p className="error full">{error}</p>}
    </form>
  )
}

function CategoryRow({ path, name, depth }: { path: string; name: string; depth: number }) {
  const { refreshVocabulary } = useSession()
  const [mode, setMode] = useState<'view' | 'rename' | 'delete' | 'add'>('view')
  const [newPath, setNewPath] = useState(path)
  const { busy, error, act, clearError } = useAction()
  const done = () => {
    setMode('view')
    refreshVocabulary()
  }
  return (
    <>
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
        {(mode === 'view' || mode === 'add') && (
          <div className="row tight">
            {depth < 2 && <IconButton icon={Plus} label={`Add subcategory under ${path}`} onClick={() => setMode('add')} />}
            <IconButton icon={Pencil} label={`Rename ${path}`} onClick={() => setMode('rename')} />
            <IconButton icon={Trash2} label={`Delete ${path}`} danger onClick={() => setMode('delete')} />
          </div>
        )}
        {error && <p className="error full">{error}</p>}
      </li>
      {mode === 'add' && <li className={`list-row depth-${depth + 1}`}><NewCategory parent={path} onDone={done} /></li>}
    </>
  )
}

// Settings → Household → People & things.
export function PeoplePage() {
  const { costCenters } = useSession()
  const [adding, setAdding] = useState(false)
  return (
    <section className="section">
      <div className="section-head">
        <p className="muted small" style={{ margin: 0 }}>Who and what money is spent for. The kind tells your assistant which purchases each one could be for: fuel for a Car, rent for a Home.</p>
        {!adding && <button onClick={() => setAdding(true)}>Add a person or thing</button>}
      </div>
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
      </div>
      {mode === 'delete' ? (
        <div className="row tight">
          <button className="danger" disabled={busy} onClick={() => void act(() => api.deleteCostCenter(cc.name)).then((ok) => ok && (setMode('view'), refreshVocabulary()))}>Delete {cc.name}</button>
          <button onClick={() => { setMode('view'); clearError() }}>Keep</button>
        </div>
      ) : (
        <div className="row tight">
          <IconButton icon={Pencil} label={`Edit ${cc.name}`} onClick={() => setMode('edit')} />
          <IconButton icon={Trash2} label={`Delete ${cc.name}`} danger onClick={() => setMode('delete')} />
        </div>
      )}
      {error && <p className="error full">{error}</p>}
    </li>
  )
}

function CostCenterEditor({ cc, onDone }: { cc?: CostCenter; onDone: () => void }) {
  const { refreshVocabulary } = useSession()
  const [form, setForm] = useState({ name: cc?.name ?? '', kind: cc?.kind ?? '' })
  const { busy, error, act } = useAction()
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const body = { name: form.name.trim(), kind: form.kind.trim() }
    const ok = await act(() =>
      cc ? api.updateCostCenter(cc.name, { ...(body.name !== cc.name && { new_name: body.name }), kind: body.kind }) : api.addCostCenter(body),
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
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !form.name.trim() || !form.kind.trim()}>{cc ? 'Save' : 'Add'}</button>
        <button type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}
