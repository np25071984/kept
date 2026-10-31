import { describe, expect, it } from 'vitest'
import { checkedGroups, computeCoverage, groupsWithLines, isUnder, uniqueGroups } from '../../src/domain/coverage.js'
import { watchInput } from '../../src/domain/memory.js'

describe('watched groups', () => {
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

describe('checked groups', () => {
  const watched = [{ kind: 'category' as const, path: 'Groceries/Alcohol' }, { kind: 'item' as const, item: 'snacks' }]

  it('reads a subcategory as under its parent, whatever the case', () => {
    expect(isUnder('groceries/alcohol', 'Groceries')).toBe(true)
    expect(isUnder('Groceries', 'Groceries')).toBe(true)
    expect(isUnder('Groceries2', 'Groceries')).toBe(false)
  })

  it('counts a group a line falls in as checked, beside the ones the user answered about', () => {
    const lines = [{ amount: 900, category: 'Groceries/Alcohol/Wine' }, { amount: 300, category: 'Groceries', item: 'Snacks' }]
    expect(groupsWithLines(watched, lines)).toEqual(['Groceries/Alcohol', 'snacks'])
    expect(checkedGroups([' Groceries/Alcohol ', 'Car'], watched, [{ amount: 100, category: 'Groceries' }])).toEqual(['Groceries/Alcohol', 'Car'])
  })
})
