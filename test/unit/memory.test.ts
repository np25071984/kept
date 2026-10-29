import { describe, expect, it } from 'vitest'
import { computeCoverage, uniqueGroups } from '../../src/domain/coverage.js'
import { isExpired, watchInput } from '../../src/domain/memory.js'

describe('notes and watched groups', () => {
  it('expires a note the day after its date', () => {
    expect(isExpired('2026-10-28', '2026-10-29')).toBe(true)
    expect(isExpired('2026-10-29', '2026-10-29')).toBe(false)
    expect(isExpired(null, '2026-10-29')).toBe(false)
  })

  it('watches a category or an item, not both', () => {
    expect(watchInput({ category: ' Groceries/Alcohol ' })).toEqual({ category: 'Groceries/Alcohol' })
    expect(watchInput({ item: 'snacks', category: null })).toEqual({ item: 'snacks' })
    expect(watchInput({ category: 'Groceries', item: 'snacks' })).toHaveProperty('code', 'invalid_watch')
    expect(watchInput({ item: ' ' })).toHaveProperty('code', 'invalid_watch')
  })

  it('keeps one entry per group', () => {
    expect(uniqueGroups([{ kind: 'item', item: 'Snacks' }, { kind: 'item', item: 'snacks' }, { kind: 'category', path: 'Groceries/Alcohol' }])).toHaveLength(2)
  })
})

describe('computeCoverage', () => {
  it('estimates from the checked share of the parent category', () => {
    const coverage = computeCoverage({ kind: 'category', path: 'Groceries/Alcohol' }, [
      { checked_groups: ['Groceries/Alcohol'], lines: [{ amount: 11000, category: 'Groceries/Alcohol', item: null }, { amount: 49000, category: 'Groceries', item: null }] },
      { checked_groups: [], lines: [{ amount: 40000, category: 'Groceries', item: null }] },
      { checked_groups: [], lines: [{ amount: 6000, category: 'Car/Fuel', item: null }] },
    ])
    expect(coverage).toEqual({ group: 'Groceries/Alcohol', total: 11000, checked_share: 0.6, estimate: 18333 })
  })

  it('counts a "no" as checked with $0', () => {
    const coverage = computeCoverage({ kind: 'item', item: 'snacks' }, [
      { checked_groups: ['snacks'], lines: [{ amount: 1148, category: 'Groceries', item: 'snacks' }, { amount: 2852, category: 'Groceries', item: null }] },
      { checked_groups: ['snacks'], lines: [{ amount: 9500, category: 'Groceries', item: null }] },
    ])
    expect(coverage).toEqual({ group: 'snacks', total: 1148, checked_share: 1, estimate: 1148 })
  })

  it('has no share without base spending', () => {
    expect(computeCoverage({ kind: 'item', item: 'snacks' }, [])).toEqual({ group: 'snacks', total: 0, checked_share: null, estimate: null })
  })
})
