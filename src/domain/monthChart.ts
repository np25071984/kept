// Where the per-month chart's grid lines, bars and average line go, in SVG units. Reports in the web app and the
// landing page draw the same chart from it, styled by the .chart rules in site.css.

export const CHART_WIDTH = 640
// A phone draws six months in a narrower box, so the labels scale down less; .chart.narrow sets their size.
export const NARROW_CHART_WIDTH = 320
export const CHART_HEIGHT = 210
const BASE = 184
const PLOT = 170
// Month labels sit below the bars.
export const LABEL_Y = 202

export interface MonthBar { month: string; amount: number; slotX: number; x: number; y: number; width: number; height: number; partial: boolean }

export interface MonthChartLayout {
  width: number
  // Where the plot starts, leaving room for the axis labels.
  left: number
  slot: number
  plotTop: number
  plotHeight: number
  ticks: { value: number; y: number }[]
  // Oldest first; the last is the running month.
  bars: MonthBar[]
  averageY: number | null
}

// `label` formats an axis value ("$3.5K"); its length decides how much room the axis takes.
export function monthChartLayout(months: readonly { month: string; amount: number }[], average: number | null, label: (value: number) => string, width = CHART_WIDTH): MonthChartLayout {
  const max = Math.max(1, ...months.map((m) => m.amount), average ?? 0)
  const step = 10 ** Math.floor(Math.log10(max))
  const unit = max / step > 5 ? step : step / 2
  const ceiling = Math.ceil(max / unit) * unit
  const values = Array.from({ length: Math.round(ceiling / unit) + 1 }, (_, i) => i * unit)
  // Room for the longest axis label at 11px: "$3.5K" needs little, "3,5 тыс. $" more.
  const left = Math.max(44, 10 + 6.2 * Math.max(...values.map((v) => label(v).length)))
  const y = (v: number) => BASE - (v / ceiling) * PLOT
  const slot = (width - left) / Math.max(1, months.length)
  const bars = months.map((m, i) => {
    const top = y(m.amount)
    return { month: m.month, amount: m.amount, slotX: left + i * slot, x: left + i * slot + slot * 0.19, y: top, width: slot * 0.62, height: BASE - top, partial: i === months.length - 1 }
  })
  return { width, left, slot, plotTop: BASE - PLOT, plotHeight: PLOT, ticks: values.map((value) => ({ value, y: y(value) })), bars, averageY: average == null ? null : y(average) }
}
