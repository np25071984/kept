import { locale } from '../i18n.js'
import { Pause, Pencil, Play, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router'
import { api } from '../api.js'
import { IconButton } from '../IconButton.js'
import { formatMoney, parseAmount } from '../lib/money.js'
import { cadence } from '../lib/recurring.js'
import type { Recurring } from '../lib/types.js'
import { useAction, useLoad, useSession } from '../session.js'
import { t } from '../i18n.js'

const short = (date: string, year = false) => new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', ...(year && { year: 'numeric' }), timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

// The member's recurring bills: this month's total, then each with its next date; pause, edit or delete.
export function RecurringPage() {
  const { setup } = useSession()
  const list = useLoad(() => api.recurring(), [])
  const [editing, setEditing] = useState<string | null>(null)
  const { hash } = useLocation()
  useEffect(() => { if (hash && list.data) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' }) }, [hash, list.data])
  const currency = setup.household.currency
  const month = list.data?.month
  const monthName = month && new Intl.DateTimeFormat(locale(), { month: 'long', timeZone: 'UTC' }).format(new Date(`${month.month}-01T00:00:00Z`))
  return (
    <>
      <div className="page-head">
        <h1>{t('Recurring')}</h1>
        {month && list.data!.repeats.length > 0 && <p className="muted">{month.to_come > 0 ? t('{month}: {total} · {left} still to come', { month: monthName!, total: formatMoney(month.total, currency), left: formatMoney(month.to_come, currency) }) : t('{month}: {total} · all logged', { month: monthName!, total: formatMoney(month.total, currency) })}</p>}
      </div>
      {list.error && <p className="error">{list.error}</p>}
      {list.data && list.data.repeats.length === 0 && <p className="empty">{t('No recurring bills yet. Open a purchase and choose "Make it recurring", or tell your assistant "this is monthly".')}</p>}
      <ul className="list">
        {list.data?.repeats.map((r) => editing === r.id
          ? <li key={r.id} id={r.id} className="list-row"><Editor r={r} onDone={(saved) => { setEditing(null); if (saved) list.reload() }} /></li>
          : <Row key={r.id} r={r} currency={currency} onEdit={() => setEditing(r.id)} onChanged={list.reload} />)}
      </ul>
    </>
  )
}

function Row({ r, currency, onEdit, onChanged }: { r: Recurring; currency: string; onEdit: () => void; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const { busy, error, act } = useAction()
  const name = r.merchant ?? r.category ?? t('This bill')
  return (
    <li id={r.id} className="list-row">
      <div className="grow">
        <div><strong>{name}</strong> <span className="muted small">· {cadence(r)}</span></div>
        <div className="tags">
          {r.category && <span className="tag">{r.category}</span>}
          {r.spent_for.map((s) => <span key={s} className="tag for">{s}</span>)}
          {r.paused && <span className="tag">{t('Paused')}</span>}
        </div>
        {r.last && <div className="small muted">{t('Last {amount} on {date}', { amount: formatMoney(r.last.amount, currency), date: short(r.last.date) })}</div>}
      </div>
      <div className="amount-col">
        <strong className="num">{formatMoney(r.amount, currency)}</strong>
        <span className="small muted">{r.paused ? t('Paused') : t('Next {date}', { date: short(r.next_date, !r.next_date.startsWith(String(new Date().getFullYear()))) })}</span>
      </div>
      {confirming ? (
        <div className="row tight">
          <span className="small muted">{t('Delete the recurring {name} bill? Purchases already logged stay.', { name })}</span>
          <button className="danger" disabled={busy} onClick={() => act(async () => { await api.deleteRecurring(r.id); onChanged() })}>{t('Delete')}</button>
          <button onClick={() => setConfirming(false)}>{t('Keep')}</button>
        </div>
      ) : (
        <div className="row tight">
          {r.paused
            ? <IconButton icon={Play} label={t('Resume')} disabled={busy} onClick={() => act(async () => { await api.updateRecurring(r.id, { paused: false }); onChanged() })} />
            : <IconButton icon={Pause} label={t('Pause')} disabled={busy} onClick={() => act(async () => { await api.updateRecurring(r.id, { paused: true }); onChanged() })} />}
          <IconButton icon={Pencil} label={t('Edit {name}', { name })} onClick={onEdit} />
          <IconButton icon={Trash2} label={t('Delete recurring bill')} danger onClick={() => setConfirming(true)} />
        </div>
      )}
      {error && <p className="error full">{error}</p>}
    </li>
  )
}

const EVERY = [
  ['weekly', 1, 'Week'], ['weekly', 2, '2 weeks'], ['monthly', 1, 'Month'], ['monthly', 3, '3 months'], ['monthly', 6, '6 months'], ['yearly', 1, 'Year'],
] as const

function Editor({ r, onDone }: { r: Recurring; onDone: (saved: boolean) => void }) {
  const [form, setForm] = useState({ amount: r.amount.toFixed(2), every: `${r.frequency}:${r.interval}`, next: r.next_date, until: r.ends_on ?? '' })
  const { busy, error, act } = useAction()
  const cents = parseAmount(form.amount)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const [frequency, interval] = form.every.split(':')
    const ok = await act(() => api.updateRecurring(r.id, {
      amount: cents! / 100, frequency, interval: Number(interval), ...(form.next !== r.next_date && { anchor: form.next }), ends_on: form.until || null,
    }))
    if (ok) onDone(true)
  }
  const options = EVERY.some(([f, i]) => `${f}:${i}` === form.every) ? EVERY : [...EVERY, [r.frequency, r.interval, `${r.interval} × ${r.frequency}`] as const]
  return (
    <form className="panel editor grow" onSubmit={save}>
      <h2>{t('Edit {name}', { name: r.merchant ?? r.category ?? t('This bill') })}</h2>
      <div className="grid">
        <label>{t('Amount')}<input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
        <label>{t('Every')}<select value={form.every} onChange={(e) => setForm({ ...form, every: e.target.value })}>{options.map(([f, i, label]) => <option key={`${f}:${i}`} value={`${f}:${i}`}>{t(label)}</option>)}</select></label>
        <label>{t('Next on')}<input type="date" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>
        <label>{t('Until (optional)')}<input type="date" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} /></label>
      </div>
      <p className="small muted">{t('Changes apply from the next one; purchases already logged stay as they are.')}</p>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || cents == null}>{t('Save')}</button>
        <button type="button" onClick={() => onDone(false)}>{t('Cancel')}</button>
      </div>
    </form>
  )
}
