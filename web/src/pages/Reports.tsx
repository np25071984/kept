import { locale } from '../i18n.js'
import { NavLink, useSearchParams } from 'react-router'
import { api } from '../api.js'
import { todayIn } from '../lib/dates.js'
import { periodRange, type Period } from '../lib/filters.js'
import { formatMoney } from '../lib/money.js'
import { biggestChange, categoryBars, merchantBars, monthlyAverage, NOBODY, drawnBars, onTrack, OTHER, peopleBars, previousRange, topLevelTotal, trend, type Bar, type Row } from '../lib/reports.js'
import { useLoad, useSession } from '../session.js'
import { CHART_HEIGHT, LABEL_Y, monthChartLayout, NARROW_CHART_WIDTH } from '../../../src/domain/monthChart.js'
import { t } from '../i18n.js'

type Scope = 'me' | 'household'
type Tab = 'category' | 'people' | 'merchants'

const monthName = (ym: string, style: 'short' | 'long' = 'short') => new Intl.DateTimeFormat(locale(), { month: style, timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`))
// "Sep 1 – 29" in English, "1–29 сент." in Russian.
const dayRange = (from: string, to: string) =>
  new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }).formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`))

// Reports · Mine and Reports · Household: the trend, then a chosen period broken down in tabs.
export function ReportsPage({ scope, tab }: { scope: Scope; tab: Tab }) {
  const { setup } = useSession()
  const today = todayIn(setup.household.timezone, new Date())
  const currency = setup.household.currency
  const money = (n: number) => formatMoney(n, currency)
  const [params, setParams] = useSearchParams()
  const period = (params.get('period') ?? 'this_month') as Exclude<Period, 'all'>
  const range = periodRange({ period, from: params.get('from') ?? today.slice(0, 8) + '01', to: params.get('to') ?? today }, today)
  const from = range.from ?? today
  const to = range.to ?? today
  const prev = previousRange(from, to)
  const base = scope === 'me' ? '/reports/mine' : '/reports/household'
  const groupBy = tab === 'category' ? 'category' : tab === 'people' ? 'cost_center' : 'merchant'

  const trendData = useLoad(() => api.summary({ scope, group_by: 'category', period: 'month', from: `${trend([], today)[0]!.month}-01`, to: today }), [scope, today])
  const thisMonth = useLoad(() => Promise.all([
    api.summary({ scope, group_by: 'category', from: `${today.slice(0, 7)}-01`, to: today }),
    api.summary({ scope, group_by: 'category', ...previousRange(`${today.slice(0, 7)}-01`, today) }),
  ]), [scope, today])
  const breakdown = useLoad(() => Promise.all([
    api.summary({ scope, group_by: groupBy, from, to }),
    api.summary({ scope, group_by: groupBy, ...prev }),
    api.summary({ scope, group_by: 'category', from, to }),
    api.summary({ scope, group_by: 'category', ...prev }),
  ]), [scope, groupBy, from, to])
  const caps = useLoad(() => (scope === 'me' ? api.caps() : Promise.resolve([])), [scope])

  const months = trendData.data ? trend(trendData.data.totals, today) : []
  const average = monthlyAverage(months)
  const soFar = thisMonth.data ? topLevelTotal(thisMonth.data[0].totals) : 0
  const before = thisMonth.data ? topLevelTotal(thisMonth.data[1].totals) : 0

  let bars: Bar[] = []
  let total = 0
  let prevTotal = 0
  if (breakdown.data) {
    const [cur, old, catCur, catOld] = breakdown.data
    total = topLevelTotal(catCur.totals)
    prevTotal = topLevelTotal(catOld.totals)
    bars = tab === 'category' ? categoryBars(cur.totals, old.totals) : tab === 'people' ? peopleBars(cur.totals, old.totals, total, prevTotal) : merchantBars(cur.totals, old.totals)
  }
  const change = biggestChange(bars)
  const diff = total - prevTotal
  const setPeriod = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('period', value)
    if (value === 'custom') { next.set('from', from); next.set('to', to) } else { next.delete('from'); next.delete('to') }
    setParams(next, { replace: true })
  }
  const setDate = (key: 'from' | 'to', value: string) => { const next = new URLSearchParams(params); next.set(key, value); setParams(next, { replace: true }) }
  const query = params.toString() ? `?${params}` : ''

  return (
    <>
      <div className="page-head"><h1>{t(scope === 'me' ? 'Reports · Mine' : 'Reports · Household')}</h1></div>
      <p className="muted small">{t(scope === 'me' ? 'Only your purchases, private ones included.' : 'Everyone\'s purchases except private ones. Never broken down by member.')}</p>

      <section className="section">
        <h2>{t('The trend')}</h2>
        {caps.data?.filter((c) => c.state !== 'under').map((c) => (
          <p key={c.id} className="capline">{t(c.period === 'month' ? '{name}: {spent} of your {amount} cap this month ({pct}%).' : '{name}: {spent} of your {amount} cap this year ({pct}%).', { name: (c.category ?? c.cost_center)!, spent: money(c.spent), amount: money(c.amount), pct: Math.round((c.spent / c.amount) * 100) })} <NavLink to="/preferences#caps">{t('Caps')}</NavLink></p>
        ))}
        <div className="card-section">
          <div className="section-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <h3>{t('Per month')}</h3>
            <div style={{ textAlign: 'right' }}>
              <div><span className="small muted">{t('{month} so far', { month: monthName(today.slice(0, 7), 'long') })}</span> <strong className="num big">{money(soFar)}</strong></div>
              <div className="small muted">{t(soFar <= before ? '{amount} less than {range}' : '{amount} more than {range}', { amount: money(Math.abs(soFar - before)), range: dayRange(previousRange(`${today.slice(0, 7)}-01`, today).from, previousRange(`${today.slice(0, 7)}-01`, today).to) })}{average != null && <> · {t('average {amount}', { amount: money(average) })}</>} · {t('on track for {amount}', { amount: money(onTrack(soFar, today)) })}</div>
            </div>
          </div>
          <MonthChart currency={currency} months={months} average={average} money={money} />
        </div>
      </section>

      <section className="section breakdown">
        <h2>{t('Breakdown')}</h2>
        <div className="row">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t('Period')} style={{ width: 'auto' }}>
            <option value="this_month">{t('This month')}</option><option value="last_month">{t('Last month')}</option><option value="this_year">{t('This year')}</option>
            <option value="last_12">{t('Last 12 months')}</option><option value="custom">{t('Custom…')}</option>
          </select>
          {period === 'custom' ? (
            <>
              <input type="date" value={from} onChange={(e) => setDate('from', e.target.value)} aria-label={t('From')} style={{ width: 'auto' }} />
              <input type="date" value={to} onChange={(e) => setDate('to', e.target.value)} aria-label={t('To')} style={{ width: 'auto' }} />
            </>
          ) : <span className="small muted">{dayRange(from, to)}</span>}
        </div>
        <nav className="folder-tabs" aria-label={t('Breakdown')}>
          <NavLink to={`${base}${query}`} end><span className="long">{t('By category')}</span><span className="short">{t('Category')}</span></NavLink>
          <NavLink to={`${base}/people${query}`}><span className="long">{t('By people & things')}</span><span className="short">{t('People & things')}</span></NavLink>
          <NavLink to={`${base}/merchants${query}`}><span className="long">{t('By merchant')}</span><span className="short">{t('Merchant')}</span></NavLink>
        </nav>
        <div className="card-section folder-body">
          {breakdown.error && <p className="error">{breakdown.error}</p>}
          {change && <p className="small"><span className="muted">{t('Biggest change:')}</span> <strong>{change.label} {change.amount >= change.prev ? '+' : '−'}{money(Math.abs(change.amount - change.prev))}</strong></p>}
          {breakdown.data && bars.every((b) => b.amount === 0) && <p className="muted">{t('Nothing logged in this period.')}</p>}
          <Bars bars={drawnBars(bars)} money={money} />
          <div className="totalline">
            <span><strong>{t('Total')}</strong> <span className="small muted">· {t(diff <= 0 ? '{amount} less than {range}' : '{amount} more than {range}', { amount: money(Math.abs(diff)), range: dayRange(prev.from, prev.to) })}</span></span>
            <strong className="num">{money(total)}</strong>
          </div>
          <div className="legend"><span><span className="sw" />{t('This period')}</span><span><span className="sw tick" />{t('Same days last period')}</span></div>
          {tab === 'people' && <p className="small muted">{t('A shared bill counts toward each by its share; "Nobody in particular" is spending with no person or thing.')}</p>}
          {tab === 'merchants' && <p className="small muted">{t('The five biggest merchants of the period; the rest add up as "Other merchants".')}{scope === 'household' && t(' A merchant shows by name only when at least two members bought there.')}</p>}
          <details className="table-view"><summary>{t('Show as table')}</summary>
            <table className="lines"><thead><tr><th></th><th className="num">{t('This period')}</th><th className="num">{t('Before')}</th></tr></thead>
              <tbody>{bars.map((b) => <tr key={b.key}><td>{b.sub ? '   ' : ''}{b.label}</td><td className="num">{money(b.amount)}</td><td className="num">{money(b.prev)}</td></tr>)}
                <tr><td><strong>{t('Total')}</strong></td><td className="num"><strong>{money(total)}</strong></td><td className="num">{money(prevTotal)}</td></tr></tbody>
            </table>
          </details>
        </div>
      </section>
    </>
  )
}

function Bars({ bars, money }: { bars: Bar[]; money: (n: number) => string }) {
  const top = Math.max(1, ...bars.map((b) => Math.max(b.amount, b.prev)))
  const w = (n: number) => `${(n / top) * 95}%`
  return (
    <div className="hbars">
      {bars.map((b) => (
        <div key={b.key} className={`hbar${b.sub ? ' sub' : ''}`} title={`${b.key}: ${money(b.amount)} (before: ${money(b.prev)})`}>
          <span>{b.key === NOBODY || b.key === OTHER ? t(b.label) : b.label}</span>
          <span className="track"><span className="fill" style={{ width: w(b.amount) }} /><span className="prev" style={{ left: w(b.prev) }} /></span>
          <span className="val num">{money(b.amount)}</span>
        </div>
      ))}
    </div>
  )
}

function MonthChart({ months: all, average, money, currency }: { months: { month: string; amount: number }[]; average: number | null; money: (n: number) => string; currency: string }) {
  // On a phone the last 6 months in a narrower box, so the labels stay readable.
  const narrow = typeof window !== 'undefined' && window.innerWidth < 600
  const months = narrow ? all.slice(-6) : all
  if (!months.length) return null
  const label = (v: number) => new Intl.NumberFormat(locale(), { style: 'currency', currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v)
  const chart = monthChartLayout(months, average, label, narrow ? NARROW_CHART_WIDTH : undefined)
  return (
    <>
      <svg className={`chart${narrow ? ' narrow' : ''}`} viewBox={`0 0 ${chart.width} ${CHART_HEIGHT}`} role="img" aria-label={t('Spending per month')}>
        <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="var(--accent)" /></pattern></defs>
        {chart.ticks.map((tick) => <g key={tick.value}><line className="grid" x1={chart.left} x2={chart.width} y1={tick.y} y2={tick.y} /><text x={chart.left - 6} y={tick.y + 4} textAnchor="end">{label(tick.value)}</text></g>)}
        {chart.bars.map((bar) => (
          <g key={bar.month}>
            <title>{monthName(bar.month)}: {money(bar.amount)}{bar.partial ? ' so far' : ''}</title>
            <rect className="hit" x={bar.slotX} y={chart.plotTop} width={chart.slot} height={chart.plotHeight} />
            {bar.amount > 0 && <rect className={`bar${bar.partial ? ' partial' : ''}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx={4} />}
            <text x={bar.x + bar.width / 2} y={LABEL_Y} textAnchor="middle">{monthName(bar.month)}</text>
          </g>
        ))}
        {chart.averageY != null && <line className="avg" x1={chart.left} x2={chart.width} y1={chart.averageY} y2={chart.averageY} />}
      </svg>
      <div className="legend"><span><span className="sw" />{t('Spent')}</span><span><span className="sw hatch" />{t('This month so far')}</span>{average != null && <span><span className="sw dash" />{t('12-month average')}</span>}</div>
    </>
  )
}
