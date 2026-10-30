import type { Language } from '../domain/language.js'
import { CHART_HEIGHT, CHART_WIDTH, LABEL_Y, monthChartLayout } from '../domain/monthChart.js'
import { onTrack, previousRange, shiftMonths } from '../domain/months.js'
import { tr } from '../i18n.js'
import { escape } from '../oauth/pages.js'

// The landing page's example of Reports' per-month chart, drawn from sample spending that ends in the current month,
// so the months and "so far" stay current. Same layout and .chart styles as the web app (src/domain/monthChart.ts).

// Whole months, oldest first; the last is what the running month will come to.
const SAMPLE = [1382.45, 1957.1, 1538.62, 1549.8, 1597.33, 1655.91, 1546.27, 1659.08, 3118.4, 1796.55, 1688.51, 1552.27]
const CURRENCY = 'USD'

const cents = (n: number) => Math.round(n * 100) / 100
const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()

// The sample as Reports would see it on `today`: twelve months, the last one so far, and the same days of the one before.
export function sampleMonths(today: string): { months: { month: string; amount: number }[]; average: number; soFar: number; before: number } {
  const keys = SAMPLE.map((_, i) => shiftMonths(`${today.slice(0, 7)}-01`, SAMPLE.length - 1 - i).slice(0, 7))
  const day = Number(today.slice(8, 10))
  const soFar = cents((SAMPLE.at(-1)! * day) / daysIn(keys.at(-1)!))
  const previous = keys.at(-2)!
  const before = cents((SAMPLE.at(-2)! * Math.min(day, daysIn(previous))) / daysIn(previous))
  const months = keys.map((month, i) => ({ month, amount: i === keys.length - 1 ? soFar : SAMPLE[i]! }))
  const average = cents(SAMPLE.slice(0, -1).reduce((s, a) => s + a, 0) / (SAMPLE.length - 1))
  return { months, average, soFar, before }
}

export function landingChart(lang: Language, today: string): string {
  const t = (text: string, vars?: Record<string, string>) => escape(tr(lang, text, vars))
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US'
  const money = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: CURRENCY }).format(n)
  const axis = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: CURRENCY, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n)
  const monthName = (ym: string, style: 'short' | 'long') => new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`))
  const dayRange = (r: { from: string; to: string }) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).formatRange(new Date(`${r.from}T00:00:00Z`), new Date(`${r.to}T00:00:00Z`))
  const { months, average, soFar, before } = sampleMonths(today)

  const svg = (shown: typeof months) => {
    const chart = monthChartLayout(shown, average, axis)
    return `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${t('Kept\'s monthly spending chart for a household: twelve months of bars, a dashed line for the average, and this month so far.')}">
${chart.ticks.map((tick) => `<line class="grid" x1="${chart.left}" x2="${CHART_WIDTH}" y1="${tick.y}" y2="${tick.y}"/><text x="${chart.left - 6}" y="${tick.y + 4}" text-anchor="end">${escape(axis(tick.value))}</text>`).join('')}
${chart.bars.map((bar) => `<g><title>${escape(monthName(bar.month, 'short'))}: ${escape(money(bar.amount))}</title><rect class="bar${bar.partial ? ' partial' : ''}" x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" rx="4"/><text x="${bar.x + bar.width / 2}" y="${LABEL_Y}" text-anchor="middle">${escape(monthName(bar.month, 'short'))}</text></g>`).join('')}
${chart.averageY == null ? '' : `<line class="avg" x1="${chart.left}" x2="${CHART_WIDTH}" y1="${chart.averageY}" y2="${chart.averageY}"/>`}
</svg>`
  }

  const range = dayRange(previousRange(`${today.slice(0, 7)}-01`, today))
  const change = t(soFar <= before ? '{amount} less than {range}' : '{amount} more than {range}', { amount: money(Math.abs(cents(soFar - before))), range })
  // The hatch pattern lives outside both charts: a pattern inside a hidden SVG doesn't paint.
  return `<div class="card-section">
  <svg width="0" height="0" class="defs" aria-hidden="true"><defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="var(--accent)"/></pattern></defs></svg>
  <div class="chart-head">
    <h3>${t('Per month')}</h3>
    <div class="chart-totals">
      <div><span class="small muted">${t('{month} so far', { month: monthName(today.slice(0, 7), 'long') })}</span> <strong class="num big">${escape(money(soFar))}</strong></div>
      <div class="small muted">${change} · ${t('average {amount}', { amount: money(average) })} · ${t('on track for {amount}', { amount: money(onTrack(soFar, today)) })}</div>
    </div>
  </div>
  <div class="months-12">${svg(months)}</div>
  <div class="months-6">${svg(months.slice(-6))}</div>
  <div class="legend"><span><span class="sw"></span>${t('Spent')}</span><span><span class="sw hatch"></span>${t('This month so far')}</span><span><span class="sw dash"></span>${t('12-month average')}</span></div>
</div>`
}
