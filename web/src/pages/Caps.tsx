import { Pencil, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api } from '../api.js'
import { IconButton } from '../IconButton.js'
import { formatMoney, parseAmount, toCents } from '../lib/money.js'
import type { Cap } from '../lib/types.js'
import { useAction, useLoad, useSession } from '../session.js'
import { t } from '../i18n.js'

// Preferences → Caps: soft reminders with this month's or year's progress.
export function CapsSection() {
  const list = useLoad(() => api.caps(), [])
  const [mode, setMode] = useState<'list' | 'add' | string>('list')
  return (
    <section className="section" id="caps">
      <div className="section-head">
        <h2>{t('Caps')}</h2>
        {mode === 'list' && <button onClick={() => setMode('add')}>{t('Set a cap')}</button>}
      </div>
      <p className="muted small">{t('Soft reminders: nothing is blocked. Your assistant mentions a cap once a purchase takes it past 80%.')}</p>
      {list.error && <p className="error">{list.error}</p>}
      {list.data && list.data.length === 0 && mode !== 'add' && <p className="muted">{t('No caps yet.')}</p>}
      <ul className="list">
        {list.data?.map((cap) => mode === cap.id
          ? <li key={cap.id} className="list-row"><CapEditor cap={cap} onDone={(saved) => { setMode('list'); if (saved) list.reload() }} /></li>
          : <CapRow key={cap.id} cap={cap} onEdit={() => setMode(cap.id)} onChanged={list.reload} />)}
        {mode === 'add' && <li className="list-row"><CapEditor onDone={(saved) => { setMode('list'); if (saved) list.reload() }} /></li>}
      </ul>
    </section>
  )
}

function CapRow({ cap, onEdit, onChanged }: { cap: Cap; onEdit: () => void; onChanged: () => void }) {
  const { setup } = useSession()
  const { busy, error, act } = useAction()
  const currency = setup.household.currency
  const share = cap.spent / cap.amount
  const left = (toCents(cap.amount) - toCents(cap.spent)) / 100
  return (
    <li className="list-row">
      <div className="grow">
        <div className="row tight" style={{ justifyContent: 'space-between' }}>
          <span>{cap.category ?? cap.cost_center} <span className="muted small">· {t(cap.period === 'month' ? 'per month' : 'per year')}</span></span>
          <span className="num small">{t('{spent} of {amount}', { spent: formatMoney(cap.spent, currency), amount: formatMoney(cap.amount, currency) })}</span>
        </div>
        <div className={`meter ${cap.state}`}><span style={{ width: `${Math.min(100, share * 100)}%` }} /></div>
        <div className="small muted">{Math.round(share * 100)}% · {left >= 0 ? t('{amount} left', { amount: formatMoney(left, currency) }) : t('{amount} over', { amount: formatMoney(-left, currency) })}{cap.state === 'close' && <> · <strong>{t('close')}</strong></>}</div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="row tight">
        <IconButton icon={Pencil} label={t('Edit cap')} onClick={onEdit} />
        <IconButton icon={Trash2} label={t('Remove cap')} danger disabled={busy} onClick={() => act(async () => { await api.deleteCap(cap.id); onChanged() })} />
      </div>
    </li>
  )
}

function CapEditor({ cap, onDone }: { cap?: Cap; onDone: (saved: boolean) => void }) {
  const { categories, costCenters } = useSession()
  const [form, setForm] = useState({ target: cap ? '' : `c:${categories[0] ?? ''}`, amount: cap ? cap.amount.toFixed(2) : '', period: cap?.period ?? 'month' })
  const { busy, error, act } = useAction()
  const cents = parseAmount(form.amount)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const amount = cents! / 100
    const ok = cap
      ? await act(() => api.updateCap(cap.id, { amount, period: form.period }))
      : await act(() => api.addCap({ ...(form.target.startsWith('c:') ? { category: form.target.slice(2) } : { cost_center: form.target.slice(2) }), amount, period: form.period }))
    if (ok) onDone(true)
  }
  return (
    <form className="panel editor grow" onSubmit={save}>
      <div className="grid">
        <label>For
          {cap ? <input value={cap.category ?? cap.cost_center ?? ''} disabled /> : (
            <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
              <optgroup label={t('Categories')}>{categories.map((c) => <option key={c} value={`c:${c}`}>{c}</option>)}</optgroup>
              {costCenters.length > 0 && <optgroup label={t('People & things')}>{costCenters.map((c) => <option key={c.name} value={`p:${c.name}`}>{c.name}</option>)}</optgroup>}
            </select>
          )}
        </label>
        <label>{t('Up to')}<input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="500" /></label>
        <label>{t('Per')}<select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as 'month' | 'year' })}><option value="month">{t('Month')}</option><option value="year">{t('Year')}</option></select></label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || cents == null || cents <= 0}>{t('Save cap')}</button>
        <button type="button" onClick={() => onDone(false)}>{t('Cancel')}</button>
      </div>
    </form>
  )
}
