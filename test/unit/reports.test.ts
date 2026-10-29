import { describe, expect, it } from 'vitest'
import { biggestChange, categoryBars, merchantBars, onTrack, peopleBars, previousRange, trend } from '../../web/src/lib/reports.js'

describe('reports', () => {
  it('compares with the same days of the previous period', () => {
    expect(previousRange('2026-10-01', '2026-10-29')).toEqual({ from: '2026-09-01', to: '2026-09-29' })
    expect(previousRange('2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(previousRange('2026-01-01', '2026-10-29')).toEqual({ from: '2025-03-01', to: '2025-12-29' })
    expect(previousRange('2026-10-10', '2026-10-19')).toEqual({ from: '2026-09-30', to: '2026-10-09' })
  })

  it('sums the last 12 months from top-level categories', () => {
    const t = trend([{ key: 'Car', amount: 50, period: '2026-10' }, { key: 'Car/Fuel', amount: 40, period: '2026-10' }, { key: 'Groceries', amount: 25.5, period: '2025-11' }], '2026-10-29')
    expect(t).toHaveLength(12)
    expect(t[0]).toEqual({ month: '2025-11', amount: 25.5 })
    expect(t[11]).toEqual({ month: '2026-10', amount: 50 })
  })

  it('lists categories with subcategories under them, people with nobody, and the top merchants', () => {
    const cats = categoryBars([{ key: 'Car', amount: 60 }, { key: 'Car/Fuel', amount: 40 }, { key: 'Groceries', amount: 80 }], [{ key: 'Car', amount: 20 }])
    expect(cats.map((b) => [b.label, b.sub, b.prev])).toEqual([['Groceries', false, 0], ['Car', false, 20], ['Fuel', true, 0]])
    expect(biggestChange(cats)?.key).toBe('Groceries')
    const people = peopleBars([{ key: 'Kia', amount: 30 }], [], 140, 20)
    expect(people.map((b) => [b.label, b.amount, b.prev])).toEqual([['Kia', 30, 0], ['Nobody in particular', 110, 20]])
    const merchants = merchantBars([{ key: 'A', amount: 5 }, { key: 'B', amount: 4 }, { key: 'C', amount: 3 }], [{ key: 'C', amount: 1 }], 2)
    expect(merchants.map((b) => [b.label, b.amount, b.prev])).toEqual([['A', 5, 0], ['B', 4, 0], ['Other merchants', 3, 1]])
  })

  it('projects the running month', () => {
    expect(onTrack(2900, '2026-10-29')).toBe(3100)
  })
})
