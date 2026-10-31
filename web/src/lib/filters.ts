import { t } from '../i18n.js'
import { daysInMonth } from './dates.js'
import { parentPath } from '../../../src/domain/setup.js'

// My purchases' filters: kept in the URL, turned into API parameters and chips.
// Categories are a three-state tree: `cats` are whole branches, `only` are parents whose own purchases count while
// some of their subcategories don't.

export type Period = 'all' | 'this_month' | 'last_month' | 'this_year' | 'last_12' | 'custom'
export type Privacy = 'all' | 'private' | 'shared'

export interface Filters {
  q: string
  period: Period
  from: string
  to: string
  privacy: Privacy
  cats: string[]
  only: string[]
  people: string[]
  nobody: boolean
}

export const NO_FILTERS: Filters = { q: '', period: 'all', from: '', to: '', privacy: 'all', cats: [], only: [], people: [], nobody: false }

export function fromParams(p: URLSearchParams): Filters {
  const period = (p.get('period') ?? 'all') as Period
  const privacy = (p.get('privacy') ?? 'all') as Privacy
  return {
    q: p.get('q') ?? '',
    period: ['all', 'this_month', 'last_month', 'this_year', 'last_12', 'custom'].includes(period) ? period : 'all',
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    privacy: ['all', 'private', 'shared'].includes(privacy) ? privacy : 'all',
    cats: p.getAll('category'),
    only: p.getAll('only'),
    people: p.getAll('for'),
    nobody: p.get('nobody') === '1',
  }
}

export function toParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.period !== 'all') p.set('period', f.period)
  if (f.period === 'custom') {
    if (f.from) p.set('from', f.from)
    if (f.to) p.set('to', f.to)
  }
  if (f.privacy !== 'all') p.set('privacy', f.privacy)
  for (const c of f.cats) p.append('category', c)
  for (const c of f.only) p.append('only', c)
  for (const c of f.people) p.append('for', c)
  if (f.nobody) p.set('nobody', '1')
  return p
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

// The dates a period covers, given today as YYYY-MM-DD.
export function periodRange(f: Pick<Filters, 'period' | 'from' | 'to'>, today: string): { from?: string; to?: string } {
  const [y, m] = today.split('-').map(Number) as [number, number]
  switch (f.period) {
    case 'this_month': return { from: ymd(y, m, 1), to: today }
    case 'last_month': {
      const [ly, lm] = m === 1 ? [y - 1, 12] : [y, m - 1]
      return { from: ymd(ly, lm, 1), to: ymd(ly, lm, daysInMonth(ly, lm)) }
    }
    case 'this_year': return { from: ymd(y, 1, 1), to: today }
    case 'last_12': {
      const [fy, fm] = m === 12 ? [y, 1] : [y - 1, m + 1]
      return { from: ymd(fy, fm, 1), to: today }
    }
    case 'custom': return { ...(f.from && { from: f.from }), ...(f.to && { to: f.to }) }
    default: return {}
  }
}

export function apiParams(f: Filters, today: string): URLSearchParams {
  const p = new URLSearchParams()
  const range = periodRange(f, today)
  if (range.from) p.set('from', range.from)
  if (range.to) p.set('to', range.to)
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.privacy !== 'all') p.set('private', String(f.privacy === 'private'))
  for (const c of f.cats) p.append('category', c)
  for (const c of f.only) p.append('category_only', c)
  for (const c of f.people) p.append('cost_center', c)
  if (f.nobody) p.set('no_cost_center', 'true')
  return p
}

const parent = parentPath
// Strictly below, and case-sensitive: the tree holds the household's paths exactly as the server lists them.
const under = (path: string, ancestor: string) => path.startsWith(`${ancestor}/`)
const children = (path: string | null, all: string[]) => all.filter((p) => parent(p) === path)

export type Tick = 'on' | 'off' | 'partial'

export function tick(path: string, f: Pick<Filters, 'cats' | 'only'>): Tick {
  if (f.cats.some((c) => c === path || under(path, c))) return 'on'
  if (f.only.includes(path) || f.cats.some((c) => under(c, path)) || f.only.some((c) => under(c, path))) return 'partial'
  return 'off'
}

// Ticks or unticks a category, keeping `cats` and `only` the smallest description of what is chosen.
export function toggle(path: string, all: string[], f: Pick<Filters, 'cats' | 'only'>): Pick<Filters, 'cats' | 'only'> {
  let cats = [...f.cats]
  let only = [...f.only]
  if (tick(path, f) === 'on') {
    // Break any chosen ancestor into its parts down to `path`, then leave `path` out.
    const covering = cats.find((c) => c === path || under(path, c))!
    cats = cats.filter((c) => c !== covering)
    let node = covering
    while (node !== path) {
      only.push(node)
      const next = children(node, all).find((c) => c === path || under(path, c))!
      cats.push(...children(node, all).filter((c) => c !== next))
      node = next
    }
  } else {
    cats = cats.filter((c) => c !== path && !under(c, path))
    only = only.filter((c) => c !== path && !under(c, path))
    cats.push(path)
  }
  return normalize(all, cats, only)
}

// A parent kept only for itself with every subcategory chosen is the whole branch again.
function normalize(all: string[], cats: string[], only: string[]): Pick<Filters, 'cats' | 'only'> {
  for (const p of [...only].sort((a, b) => b.length - a.length)) {
    const kids = children(p, all)
    if (kids.every((k) => cats.includes(k))) {
      only = only.filter((o) => o !== p)
      cats = [...cats.filter((c) => !kids.includes(c)), p]
    }
  }
  return { cats: [...new Set(cats)].sort(), only: [...new Set(only)].sort() }
}

export interface Chip {
  label: string
  remove: (f: Filters) => Filters
}

const PERIODS: Record<Exclude<Period, 'all'>, string> = { this_month: 'This month', last_month: 'Last month', this_year: 'This year', last_12: 'Last 12 months', custom: 'Custom dates' }


export function chips(f: Filters, all: string[]): Chip[] {
  const out: Chip[] = []
  if (f.period !== 'all') out.push({ label: f.period === 'custom' ? `${f.from || '…'} – ${f.to || '…'}` : t(PERIODS[f.period]), remove: (x) => ({ ...x, period: 'all', from: '', to: '' }) })
  if (f.privacy !== 'all') out.push({ label: t(f.privacy === 'private' ? 'Only private' : 'Shared'), remove: (x) => ({ ...x, privacy: 'all' }) })
  for (const p of f.only) {
    const left = all.filter((c) => under(c, p) && tick(c, f) === 'off' && tick(parent(c)!, f) !== 'off' && !f.only.includes(c))
      .filter((c) => !leftUnderOff(c, p, f))
    const name = left.length ? t('{name}, not {rest}', { name: p, rest: left.map((c) => c.slice(p.length + 1)).join(', ') }) : p
    out.push({ label: name, remove: (x) => ({ ...x, only: x.only.filter((o) => o !== p && !under(o, p)), cats: x.cats.filter((c) => !under(c, p)) }) })
  }
  for (const c of f.cats) {
    if (f.only.some((o) => under(c, o))) continue
    out.push({ label: c, remove: (x) => ({ ...x, cats: x.cats.filter((y) => y !== c) }) })
  }
  for (const name of f.people) out.push({ label: name, remove: (x) => ({ ...x, people: x.people.filter((p) => p !== name) }) })
  if (f.nobody) out.push({ label: t('Nobody in particular'), remove: (x) => ({ ...x, nobody: false }) })
  return out
}

// Under a partly chosen parent, name only the topmost subcategories left out.
function leftUnderOff(c: string, top: string, f: Pick<Filters, 'cats' | 'only'>): boolean {
  let p = parent(c)
  while (p && p !== top) {
    if (tick(p, f) === 'off') return true
    p = parent(p)
  }
  return false
}

export function filterCount(f: Filters): number {
  return chips(f, []).length
}
