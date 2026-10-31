import { describe, expect, it } from 'vitest'
import { CHART_WIDTH, monthChartLayout, NARROW_CHART_WIDTH } from '../../src/domain/monthChart.js'

const label = (v: number) => `$${v}`
const months = (...amounts: number[]) => amounts.map((amount, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, amount }))

describe('monthChartLayout', () => {
  it('rounds the axis up to a whole step and puts zero on the baseline', () => {
    const chart = monthChartLayout(months(1200, 3100, 900), 1700, label)
    expect(chart.ticks.map((t) => t.value)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500])
    expect(chart.ticks[0]!.y).toBe(chart.plotTop + chart.plotHeight)
    expect(chart.ticks.at(-1)!.y).toBe(chart.plotTop)
  })

  it('gives every month an equal slot and marks the running month', () => {
    const chart = monthChartLayout(months(100, 200, 300, 50), null, label)
    expect(chart.slot * 4 + chart.left).toBeCloseTo(CHART_WIDTH)
    expect(chart.bars.map((b) => b.partial)).toEqual([false, false, false, true])
    expect(chart.bars[2]!.height).toBeGreaterThan(chart.bars[1]!.height)
    expect(chart.averageY).toBeNull()
  })

  it('fills a narrower box when given one', () => {
    const chart = monthChartLayout(months(100, 200, 300), null, label, NARROW_CHART_WIDTH)
    expect(chart.width).toBe(NARROW_CHART_WIDTH)
    expect(chart.slot * 3 + chart.left).toBeCloseTo(NARROW_CHART_WIDTH)
  })

  it('makes room for long axis labels', () => {
    const short = monthChartLayout(months(3000), null, label)
    const long = monthChartLayout(months(3000), null, (v) => `${v} тыс. $`)
    expect(long.left).toBeGreaterThan(short.left)
  })

  it('places the average on the same scale as the bars', () => {
    const chart = monthChartLayout(months(1000, 2000), 1000, label)
    expect(chart.averageY).toBe(chart.bars[0]!.y)
  })
})
