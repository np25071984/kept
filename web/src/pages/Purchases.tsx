import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, type TransactionFilters } from '../api.js'
import { formatDate, formatMoney, toCents } from '../lib/money.js'
import type { Transaction } from '../lib/types.js'
import { useLoad, useSession } from '../session.js'

const FILTERS = ['from', 'to', 'merchant', 'category', 'cost_center', 'item'] as const

// The member's own purchases, newest first (VISION.md §4.C, "My purchases"). Filters live in the URL.
export function PurchasesPage() {
  const { setup, categories, costCenters } = useSession()
  const [params, setParams] = useSearchParams()
  const filters: TransactionFilters = Object.fromEntries(FILTERS.flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])))
  const key = params.toString()
  const list = useLoad(() => api.transactions(filters), [key])
  const [text, setText] = useState({ merchant: filters.merchant ?? '', item: filters.item ?? '' })

  const set = (changes: Partial<Record<(typeof FILTERS)[number], string>>) => {
    const next = new URLSearchParams(params)
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value)
      else next.delete(name)
    }
    setParams(next, { replace: true })
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    set({ merchant: text.merchant.trim(), item: text.item.trim() })
  }
  const clear = () => {
    setText({ merchant: '', item: '' })
    setParams(new URLSearchParams(), { replace: true })
  }

  const purchases = list.data ?? []
  const total = purchases.reduce((sum, t) => sum + toCents(t.amount), 0) / 100
  const currency = setup.household.currency

  return (
    <>
      <div className="page-head">
        <h1>My purchases</h1>
        {list.data && (
          <p className="muted">
            {purchases.length === 500 ? 'The newest 500' : purchases.length} {purchases.length === 1 ? 'purchase' : 'purchases'}, {formatMoney(total, currency)}
          </p>
        )}
      </div>

      <form className="filters" onSubmit={submit}>
        <label>From<input type="date" value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value })} /></label>
        <label>To<input type="date" value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value })} /></label>
        <label>Merchant<input value={text.merchant} onChange={(e) => setText({ ...text, merchant: e.target.value })} placeholder="Any" /></label>
        <label>Item<input value={text.item} onChange={(e) => setText({ ...text, item: e.target.value })} placeholder="Any" /></label>
        <label>Category
          <select value={filters.category ?? ''} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Any</option>
            {categories.map((path) => <option key={path} value={path}>{path}</option>)}
          </select>
        </label>
        <label>For
          <select value={filters.cost_center ?? ''} onChange={(e) => set({ cost_center: e.target.value })}>
            <option value="">Anyone or anything</option>
            {costCenters.map((cc) => <option key={cc.name} value={cc.name}>{cc.name}</option>)}
          </select>
        </label>
        <div className="filter-actions">
          <button type="submit">Search</button>
          {key && <button type="button" className="link" onClick={clear}>Clear</button>}
        </div>
      </form>

      {list.error && <p className="error">{list.error}</p>}
      {list.loading && !list.data && <p className="muted">Loading…</p>}
      {list.data && purchases.length === 0 && <p className="empty">{key ? 'No purchases match.' : 'Nothing logged yet. Tell your assistant about a purchase and it shows up here.'}</p>}
      {purchases.length > 0 && (
        <ul className={`purchases${list.loading ? ' stale' : ''}`}>
          {purchases.map((t) => <PurchaseRow key={t.id} t={t} currency={currency} back={key} />)}
        </ul>
      )}
    </>
  )
}

export function categoriesOf(t: Transaction): string[] {
  return [...new Set(t.line_items.map((line) => line.category))]
}

export function spentFor(t: Transaction): string[] {
  return [...new Set(t.line_items.flatMap((line) => line.spent_for.map((e) => e.cost_center)))]
}

function PurchaseRow({ t, currency, back }: { t: Transaction; currency: string; back: string }) {
  const items = t.line_items.map((line) => line.item).filter(Boolean)
  const who = spentFor(t)
  return (
    <li>
      <Link to={`/purchases/${t.id}`} state={{ back }} className="purchase-row">
        <span className="date">{formatDate(t.date)}</span>
        <span className="what">
          <strong>{t.merchant ?? 'No merchant'}</strong>
          {items.length > 0 && <span className="muted"> · {items.join(', ')}</span>}
          <span className="tags">
            {categoriesOf(t).map((c) => <span key={c} className="tag">{c}</span>)}
            {who.map((name) => <span key={name} className="tag for">{name}</span>)}
            {t.private && <span className="tag private">Private</span>}
          </span>
        </span>
        <span className="amount">{formatMoney(t.amount, currency)}</span>
      </Link>
    </li>
  )
}
