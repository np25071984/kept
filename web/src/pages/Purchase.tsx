import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { api } from '../api.js'
import { formFromTransaction, patchFromForm, restCents, validateForm, type LineForm, type PurchaseForm, type SpentForForm } from '../lib/editor.js'
import { formatDate, formatMoney } from '../lib/money.js'
import type { Line, Transaction } from '../lib/types.js'
import { useAction, useLoad, useSession } from '../session.js'
import { t as tr } from '../i18n.js'

const SOURCE_LABELS: Record<string, string> = { talk: 'Told in chat', photo: 'Receipt photo', document: 'Document', email: 'Email', statement: 'Statement', other: 'Other' }

// One purchase: its lines, shares and sources, with editing, privacy, merging and deleting (VISION.md §4.C).
export function PurchasePage() {
  const { id = '' } = useParams()
  const back = (useLocation().state as { back?: string } | null)?.back
  const backTo = `/purchases${back ? `?${back}` : ''}`
  const loaded = useLoad(() => api.transaction(id), [id])
  const [mode, setMode] = useState<'view' | 'edit' | 'merge' | 'delete' | 'recur'>('view')
  const [saved, setSaved] = useState<Transaction | null>(null)
  const t = saved?.id === id ? saved : loaded.data

  if (loaded.error) return <><Link to={backTo} className="back">{tr('← My purchases')}</Link><p className="error">{loaded.error}</p></>
  if (!t) return <p className="muted">{tr('Loading…')}</p>

  const done = (updated?: Transaction) => {
    if (updated) setSaved(updated)
    setMode('view')
  }
  return (
    <>
      <Link to={backTo} className="back">{tr('← My purchases')}</Link>
      {mode === 'edit' ? <Editor t={t} onDone={done} /> : <Details t={t} />}
      {mode === 'view' && <Actions t={t} setMode={setMode} onSaved={done} />}
      {mode === 'merge' && <Merge t={t} onDone={done} />}
      {mode === 'delete' && <Delete t={t} backTo={backTo} onCancel={() => setMode('view')} />}
      {mode === 'recur' && <MakeRecurring t={t} onDone={(made) => { if (made) setSaved({ ...t, repeat_id: made }); setMode('view') }} />}
    </>
  )
}

function Details({ t }: { t: Transaction }) {
  const { setup } = useSession()
  const currency = setup.household.currency
  return (
    <article className="purchase">
      <div className="purchase-head">
        <div>
          <h1>{t.merchant ?? tr('No merchant')}</h1>
          <p className="muted">{formatDate(t.date)}{t.timezone !== setup.household.timezone && ` · ${t.timezone}`}{t.repeat_id && <> · <Link to={`/recurring#${t.repeat_id}`}>{tr('Logged by a recurring bill')}</Link></>}</p>
        </div>
        <div className="purchase-amount">
          {formatMoney(t.amount, currency)}
          {t.private && <span className="tag private">{tr('Private')}</span>}
        </div>
      </div>
      {t.notes && <p>{t.notes}</p>}
      <table className="lines">
        <thead><tr><th>{tr('Category')}</th><th>{tr('Item')}</th><th>{tr('For')}</th><th className="num">{tr('Amount')}</th></tr></thead>
        <tbody>{t.line_items.map((line, i) => <LineRow key={i} line={line} currency={currency} />)}</tbody>
      </table>
      {t.checked_groups.length > 0 && <p className="muted small">{tr('Checked for {groups}.', { groups: t.checked_groups.join(', ') })}</p>}
      <h2>{tr('Sources')}</h2>
      <ul className="sources">
        {t.sources.map((source) => (
          <li key={source.id}>
            <strong>{tr(SOURCE_LABELS[source.kind] ?? source.kind)}</strong>
            <span className="muted"> · {new Date(source.received_at).toLocaleString()}</span>
            {source.extracted && Object.keys(source.extracted).length > 0 && (
              <dl>{Object.entries(source.extracted).map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>)}</dl>
            )}
          </li>
        ))}
      </ul>
    </article>
  )
}

function LineRow({ line, currency }: { line: Line; currency: string }) {
  const shares = line.spent_for.map((e) => (e.share == null ? e.cost_center : `${e.cost_center} ${Math.round(e.share * 1000) / 10}%`))
  return (
    <tr>
      <td>{line.category}{line.rest && line.item == null && <span className="muted small"> {tr('(rest)')}</span>}</td>
      <td>{line.item ?? ''}</td>
      <td>{shares.join(', ')}</td>
      <td className="num">{formatMoney(line.amount, currency)}</td>
    </tr>
  )
}

function Actions({ t, setMode, onSaved }: { t: Transaction; setMode: (mode: 'edit' | 'merge' | 'delete' | 'recur') => void; onSaved: (t: Transaction) => void }) {
  const { busy, error, act } = useAction()
  const togglePrivate = () => act(async () => onSaved(await api.updateTransaction(t.id, { private: !t.private })))
  return (
    <div className="actions">
      <button className="primary" onClick={() => setMode('edit')}>{tr('Edit')}</button>
      <button onClick={togglePrivate} disabled={busy}>{tr(t.private ? 'Share with the household' : 'Make private')}</button>
      {!t.repeat_id && <button onClick={() => setMode('recur')}>{tr('Make it recurring…')}</button>}
      <button onClick={() => setMode('merge')}>{tr('Same as another purchase…')}</button>
      <button className="danger" onClick={() => setMode('delete')}>{tr('Delete')}</button>
      {error && <p className="error">{error}</p>}
      <p className="muted small">{tr(t.private ? 'Only you see this purchase; household totals leave it out.' : 'Its amount counts in household totals; only you see the purchase itself.')}</p>
    </div>
  )
}

// "Make it recurring": this purchase is the first one; the schedule starts from its date.
function MakeRecurring({ t, onDone }: { t: Transaction; onDone: (repeatId?: string) => void }) {
  const [every, setEvery] = useState('monthly:1')
  const { busy, error, act } = useAction()
  const save = async () => {
    const [frequency, interval] = every.split(':')
    let made: string | undefined
    if (await act(async () => { made = (await api.makeRecurring({ transaction_id: t.id, frequency: frequency!, interval: Number(interval) })).id })) onDone(made)
  }
  return (
    <div className="panel">
      <div className="row">
        <label>{tr('Recur every')}
          <select value={every} onChange={(e) => setEvery(e.target.value)}>
            <option value="weekly:1">{tr('Week')}</option><option value="weekly:2">{tr('2 weeks')}</option><option value="monthly:1">{tr('Month')}</option>
            <option value="monthly:3">{tr('3 months')}</option><option value="monthly:6">{tr('6 months')}</option><option value="yearly:1">{tr('Year')}</option>
          </select>
        </label>
      </div>
      <p className="small muted">{tr('Starting from {date}. Kept logs it on each date and tells you; the real charge still matches it.', { date: formatDate(t.date) })}</p>
      <div className="row">
        <button className="primary" onClick={save} disabled={busy}>{tr('Make it recurring')}</button>
        <button onClick={() => onDone()}>{tr('Cancel')}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function Delete({ t, backTo, onCancel }: { t: Transaction; backTo: string; onCancel: () => void }) {
  const navigate = useNavigate()
  const { busy, error, act } = useAction()
  const confirm = () => act(async () => {
    await api.deleteTransaction(t.id)
    navigate(backTo, { replace: true })
  })
  return (
    <div className="panel">
      <p>{tr('Delete this purchase and everything read for it? This can\'t be undone.')}</p>
      <div className="row">
        <button className="danger" onClick={confirm} disabled={busy}>{tr('Delete')}</button>
        <button onClick={onCancel}>{tr('Keep it')}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function Merge({ t, onDone }: { t: Transaction; onDone: (t?: Transaction) => void }) {
  const { setup } = useSession()
  const nearby = useLoad(() => api.transactions({ from: addDays(t.date, -7), to: addDays(t.date, 7) }), [t.id])
  const [other, setOther] = useState('')
  const { busy, error, act } = useAction()
  const candidates = (nearby.data ?? []).filter((c) => c.id !== t.id)
  const merge = () => act(async () => onDone(await api.merge(t.id, other)))
  return (
    <div className="panel">
      <p>{tr('Which purchase is the same as this one? Its sources and details join this one, and it is removed.')}</p>
      {nearby.loading && <p className="muted">{tr('Loading…')}</p>}
      {nearby.data && candidates.length === 0 && <p className="muted">{tr('No other purchases within a week of this one.')}</p>}
      <ul className="choices">
        {candidates.map((c) => (
          <li key={c.id}>
            <label>
              <input type="radio" name="other" value={c.id} checked={other === c.id} onChange={() => setOther(c.id)} />
              {formatDate(c.date)} · {c.merchant ?? tr('No merchant')} · {formatMoney(c.amount, setup.household.currency)}
            </label>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="primary" onClick={merge} disabled={!other || busy}>{tr('Merge into this one')}</button>
        <button onClick={() => onDone()}>{tr('Cancel')}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function Editor({ t, onDone }: { t: Transaction; onDone: (t?: Transaction) => void }) {
  const { setup, categories } = useSession()
  const [form, setForm] = useState<PurchaseForm>(() => formFromTransaction(t))
  const [problems, setProblems] = useState<string[]>([])
  const { busy, error, act } = useAction()
  const rest = restCents(form)
  const update = (changes: Partial<PurchaseForm>) => setForm({ ...form, ...changes })
  const updateLine = (i: number, line: LineForm) => update({ lines: form.lines.map((l, j) => (j === i ? line : l)) })

  const save = () => {
    const found = validateForm(form)
    setProblems(found)
    if (found.length === 0) void act(async () => onDone(await api.updateTransaction(t.id, patchFromForm(form))))
  }

  return (
    <form className="purchase editor" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div className="grid">
        <label>{tr('Merchant')}<input value={form.merchant} onChange={(e) => update({ merchant: e.target.value })} /></label>
        <label>{tr('Date')}<input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} required /></label>
        <label>Amount ({setup.household.currency})<input inputMode="decimal" value={form.amount} onChange={(e) => update({ amount: e.target.value })} required /></label>
      </div>
      <label>{tr('Notes')}<input value={form.notes} onChange={(e) => update({ notes: e.target.value })} /></label>

      <h2>{tr('Line items')}</h2>
      <p className="muted small">{tr('Price only the parts that matter; the rest of the amount goes to the main category.')}</p>
      {form.lines.map((line, i) => (
        <fieldset key={i} className="line-edit">
          <div className="grid">
            <label>{tr('Amount')}<input inputMode="decimal" value={line.amount} onChange={(e) => updateLine(i, { ...line, amount: e.target.value })} /></label>
            <label>{tr('Category')}<CategorySelect value={line.category} categories={categories} onChange={(category) => updateLine(i, { ...line, category })} /></label>
            <label>{tr('Item')}<input value={line.item} onChange={(e) => updateLine(i, { ...line, item: e.target.value })} placeholder={tr('e.g. shoes')} /></label>
          </div>
          <SpentForEditor entries={line.spent_for} onChange={(spent_for) => updateLine(i, { ...line, spent_for })} />
          <button type="button" className="link" onClick={() => update({ lines: form.lines.filter((_, j) => j !== i) })}>{tr('Remove line')}</button>
        </fieldset>
      ))}
      <button type="button" onClick={() => update({ lines: [...form.lines, { amount: '', category: '', item: '', spent_for: [] }] })}>{tr('Add a line item')}</button>

      <fieldset className="line-edit rest">
        <legend>Main category{rest != null && rest > 0 && <> · {formatMoney(rest / 100, setup.household.currency)} left for it</>}</legend>
        <label>{tr('Category')}<CategorySelect value={form.category} categories={categories} onChange={(category) => update({ category })} allowNone /></label>
        <SpentForEditor entries={form.spent_for} onChange={(spent_for) => update({ spent_for })} />
      </fieldset>

      <label className="check"><input type="checkbox" checked={form.private} onChange={(e) => update({ private: e.target.checked })} /> {tr('Private: leave it out of household totals')}</label>

      {[...problems, ...(error ? [error] : [])].map((p) => <p key={p} className="error">{p}</p>)}
      <div className="row">
        <button type="submit" className="primary" disabled={busy}>{tr('Save')}</button>
        <button type="button" onClick={() => onDone()}>{tr('Cancel')}</button>
      </div>
    </form>
  )
}

function CategorySelect({ value, categories, onChange, allowNone }: { value: string; categories: string[]; onChange: (value: string) => void; allowNone?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{tr(allowNone ? 'None (lines cover the amount)' : 'Pick a category')}</option>
      {categories.map((path) => <option key={path} value={path}>{path}</option>)}
    </select>
  )
}

function SpentForEditor({ entries, onChange }: { entries: SpentForForm[]; onChange: (entries: SpentForForm[]) => void }) {
  const { costCenters } = useSession()
  const unused = costCenters.filter((cc) => !entries.some((e) => e.cost_center.toLowerCase() === cc.name.toLowerCase()))
  const set = (i: number, entry: SpentForForm) => onChange(entries.map((e, j) => (j === i ? entry : e)))
  return (
    <div className="spent-for">
      <span className="label">{tr('For')}</span>
      {entries.map((entry, i) => (
        <span key={entry.cost_center} className="chip">
          {entry.cost_center}
          <input aria-label={`${entry.cost_center} share in percent`} className="share" inputMode="decimal" placeholder={tr('even')} value={entry.share} onChange={(e) => set(i, { ...entry, share: e.target.value })} />%
          <button type="button" className="link" aria-label={`Remove ${entry.cost_center}`} onClick={() => onChange(entries.filter((_, j) => j !== i))}>×</button>
        </span>
      ))}
      {unused.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onChange([...entries, { cost_center: e.target.value, share: '' }])} aria-label={tr('Add who or what it was for')}>
          <option value="">{tr(entries.length ? 'Add…' : 'Nobody in particular')}</option>
          {unused.map((cc) => <option key={cc.name} value={cc.name}>{cc.name}</option>)}
        </select>
      )}
    </div>
  )
}
