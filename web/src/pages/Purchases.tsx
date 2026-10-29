import { Repeat, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api.js'
import { apiParams, chips, filterCount, fromParams, NO_FILTERS, tick, toggle, toParams, type Filters } from '../lib/filters.js'
import { formatDate, formatMoney, toCents } from '../lib/money.js'
import type { Transaction } from '../lib/types.js'
import { categoryTree } from '../lib/vocabulary.js'
import { messageFor, useSession } from '../session.js'

const PAGE = 50

const todayIn = (zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

// The member's own purchases (docs/mockups/purchases.html): a search, a Filters panel with chips for what's on, grouped by month, paged.
export function PurchasesPage() {
  const { setup, categories } = useSession()
  const [params, setParams] = useSearchParams()
  const filters = fromParams(params)
  const key = params.toString()
  const today = todayIn(setup.household.timezone)
  const [page, setPage] = useState<{ key: string; items: Transaction[]; count: number; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState(filters.q)

  const apply = (next: Filters) => setParams(toParams(next), { replace: true })

  const load = async (offset: number) => {
    setLoading(true)
    try {
      const result = await api.purchases(apiParams(filters, today), PAGE, offset)
      setPage((prev) => ({ key, count: result.count, total: result.total, items: offset && prev?.key === key ? [...prev.items, ...result.transactions] : result.transactions }))
      setError(null)
    } catch (e) {
      setError(messageFor(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(0) }, [key])
  // The search applies as you type, after a short pause.
  useEffect(() => {
    if (q === filters.q) return
    const timer = setTimeout(() => apply({ ...filters, q }), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const currency = setup.household.currency
  const items = page?.items ?? []
  const active = chips(filters, categories)
  return (
    <>
      <div className="page-head">
        <h1>My purchases</h1>
        {page && <p className="muted">{page.count} {page.count === 1 ? 'purchase' : 'purchases'} · {formatMoney(page.total, currency)}</p>}
      </div>
      <div className="filterbar">
        <span className="search-field grow">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant or item" aria-label="Search merchant or item" />
        </span>
        <FiltersMenu filters={filters} categories={categories} count={page?.count} onChange={apply} />
      </div>
      {active.length > 0 && (
        <div className="fchips">
          {active.map((chip) => (
            <span key={chip.label} className="fchip">{chip.label}<button type="button" aria-label={`Remove ${chip.label}`} title={`Remove ${chip.label}`} onClick={() => apply(chip.remove(filters))}><X size={14} aria-hidden="true" /></button></span>
          ))}
          <button type="button" className="link" onClick={() => { setQ(''); apply(NO_FILTERS) }}>Clear all</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {loading && !page && <p className="muted">Loading…</p>}
      {page && items.length === 0 && <p className="empty">{key ? 'No purchases match.' : 'Nothing logged yet. Tell your assistant about a purchase and it shows up here.'}</p>}
      {items.length > 0 && (
        <ul className={`purchases${loading ? ' stale' : ''}`}>
          {byMonth(items).map(([month, list]) => [
            <li key={month} className="group"><span>{month}</span><span className="num">{formatMoney(list.reduce((s, t) => s + toCents(t.amount), 0) / 100, currency)}</span></li>,
            ...list.map((t) => <PurchaseRow key={t.id} t={t} currency={currency} back={key} />),
          ])}
        </ul>
      )}
      {page && items.length < page.count && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" disabled={loading} onClick={() => void load(items.length)}>Load older purchases</button>
        </div>
      )}
    </>
  )
}

function byMonth(items: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>()
  for (const t of items) {
    const month = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${t.date.slice(0, 7)}-01T00:00:00Z`))
    groups.set(month, [...(groups.get(month) ?? []), t])
  }
  return [...groups]
}

function FiltersMenu({ filters, categories, count, onChange }: { filters: Filters; categories: string[]; count?: number; onChange: (f: Filters) => void }) {
  const { costCenters } = useSession()
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: Event) => {
      const menu = ref.current
      if (menu?.open && (e instanceof KeyboardEvent ? e.key === 'Escape' : !menu.contains(e.target as Node))) menu.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [])
  const n = filterCount(filters)
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  return (
    <details ref={ref} className={`filtermenu${n ? ' on' : ''}`}>
      <summary><SlidersHorizontal size={16} aria-hidden="true" /> Filters{n ? ` · ${n}` : ''}</summary>
      <div className="filterpanel">
        <div className="sheet-head"><h2>Filters</h2><button type="button" className="icon-btn" aria-label="Close filters" onClick={() => ref.current && (ref.current.open = false)}><X size={16} /></button></div>
        <div className="two">
          <label>Period
            <select value={filters.period} onChange={(e) => set({ period: e.target.value as Filters['period'] })}>
              <option value="all">All time</option><option value="this_month">This month</option><option value="last_month">Last month</option>
              <option value="this_year">This year</option><option value="last_12">Last 12 months</option><option value="custom">Custom…</option>
            </select>
          </label>
          <label>Privacy
            <select value={filters.privacy} onChange={(e) => set({ privacy: e.target.value as Filters['privacy'] })}>
              <option value="all">All</option><option value="private">Only private</option><option value="shared">Shared</option>
            </select>
          </label>
        </div>
        {filters.period === 'custom' && (
          <div className="two">
            <label>From<input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} /></label>
            <label>To<input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} /></label>
          </div>
        )}
        <div>
          <h3>Category</h3>
          <div className="checks">
            {categoryTree(categories).map((row) => (
              <TriCheck key={row.path} label={row.name} depth={row.depth} state={tick(row.path, filters)} onClick={() => set(toggle(row.path, categories, filters))} />
            ))}
          </div>
        </div>
        <div>
          <h3>For</h3>
          <div className="checks">
            {costCenters.map((cc) => (
              <label key={cc.name} className="check"><input type="checkbox" checked={filters.people.includes(cc.name)}
                onChange={(e) => set({ people: e.target.checked ? [...filters.people, cc.name] : filters.people.filter((p) => p !== cc.name) })} /> {cc.name}</label>
            ))}
            <label className="check"><input type="checkbox" checked={filters.nobody} onChange={(e) => set({ nobody: e.target.checked })} /> Nobody in particular</label>
          </div>
        </div>
        <div className="foot">
          <button type="button" className="link" onClick={() => onChange({ ...NO_FILTERS, q: filters.q })}>Clear all</button>
          <button type="button" className="primary" onClick={() => ref.current && (ref.current.open = false)}>Show {count ?? ''} {count === 1 ? 'purchase' : 'purchases'}</button>
        </div>
      </div>
    </details>
  )
}

function TriCheck({ label, depth, state, onClick }: { label: string; depth: number; state: 'on' | 'off' | 'partial'; onClick: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'partial' }, [state])
  return (
    <label className="check" style={{ paddingLeft: 6 + depth * 22 }}>
      <input ref={ref} type="checkbox" checked={state === 'on'} onChange={onClick} /> {label}
    </label>
  )
}

export function categoriesOf(t: Transaction): string[] {
  return [...new Set(t.line_items.map((line) => line.category))]
}

export function spentFor(t: Transaction): string[] {
  return [...new Set(t.line_items.flatMap((line) => line.spent_for.map((e) => e.cost_center)))]
}

const SOURCE_LABELS: Record<string, string> = { talk: 'chat', photo: 'receipt', document: 'receipt', email: 'email', statement: 'statement', other: 'other' }

function PurchaseRow({ t, currency, back }: { t: Transaction; currency: string; back: string }) {
  const items = t.line_items.map((line) => line.item).filter(Boolean)
  const who = spentFor(t)
  const sources = [...new Set(t.sources.map((s) => SOURCE_LABELS[s.kind] ?? s.kind))].filter((s) => !(t.repeat_id && s === 'other'))
  return (
    <li className="row-link">
      <div className="purchase-row">
        <span className="date">{formatDate(t.date)}</span>
        <span className="what">
          <strong><Link className="stretched" to={`/purchases/${t.id}`} state={{ back }}>{t.merchant ?? 'No merchant'}</Link></strong>
          {items.length > 0 && <span className="muted"> · {items.join(', ')}</span>}
          <span className="tags">
            {categoriesOf(t).map((c) => <span key={c} className="tag">{c}</span>)}
            {who.map((name) => <span key={name} className="tag for">{name}</span>)}
            {t.private && <span className="tag private">Private</span>}
            {t.repeat_id && <Link className="tag src" to={`/recurring#${t.repeat_id}`} title="Logged by a recurring bill"><Repeat size={12} aria-hidden="true" /> recurring</Link>}
            {sources.map((s) => <span key={s} className="tag src">{s}</span>)}
          </span>
        </span>
        <span className="amount">{formatMoney(t.amount, currency)}</span>
      </div>
    </li>
  )
}
