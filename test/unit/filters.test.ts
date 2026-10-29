import { describe, expect, it } from 'vitest'
import { apiParams, chips, fromParams, NO_FILTERS, periodRange, tick, toggle, toParams } from '../../web/src/lib/filters.js'

const all = ['Car', 'Car/Fuel', 'Car/Insurance', 'Eating out', 'Groceries', 'Groceries/Alcohol', 'Groceries/Snacks']

describe('purchase filters', () => {
  it('round-trips through the URL', () => {
    const f = { ...NO_FILTERS, q: 'wine', period: 'last_month' as const, privacy: 'private' as const, cats: ['Car'], only: ['Groceries'], people: ['Kia'], nobody: true }
    expect(fromParams(toParams(f))).toEqual({ ...f })
  })

  it('turns periods into dates', () => {
    expect(periodRange({ period: 'this_month', from: '', to: '' }, '2026-10-29')).toEqual({ from: '2026-10-01', to: '2026-10-29' })
    expect(periodRange({ period: 'last_month', from: '', to: '' }, '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(periodRange({ period: 'last_12', from: '', to: '' }, '2026-10-29')).toEqual({ from: '2025-11-01', to: '2026-10-29' })
    expect(periodRange({ period: 'all', from: '', to: '' }, '2026-10-29')).toEqual({})
  })

  it('ticks a parent for its whole branch and unticks one subcategory', () => {
    let f = toggle('Groceries', all, { cats: [], only: [] })
    expect(f).toEqual({ cats: ['Groceries'], only: [] })
    expect(tick('Groceries/Alcohol', f)).toBe('on')
    f = toggle('Groceries/Alcohol', all, f)
    expect(f).toEqual({ cats: ['Groceries/Snacks'], only: ['Groceries'] })
    expect(tick('Groceries', f)).toBe('partial')
    expect(toggle('Groceries/Alcohol', all, f)).toEqual({ cats: ['Groceries'], only: [] })
  })

  it('names chips and sends the API what was chosen', () => {
    const f = { ...NO_FILTERS, cats: ['Eating out', 'Groceries/Snacks'], only: ['Groceries'], people: ['Kia'] }
    expect(chips(f, all).map((c) => c.label)).toEqual(['Groceries, not Alcohol', 'Eating out', 'Kia'])
    const p = apiParams(f, '2026-10-29')
    expect(p.getAll('category')).toEqual(['Eating out', 'Groceries/Snacks'])
    expect(p.getAll('category_only')).toEqual(['Groceries'])
    const removed = chips(f, all)[0]!.remove(f)
    expect(removed).toMatchObject({ cats: ['Eating out'], only: [] })
  })
})
