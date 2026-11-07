import { describe, expect, it } from 'vitest'
import { checkedGroups, computeCoverage, groupsWithLines, isUnder, uncheckedGroups, uniqueGroups, type WatchedGroup } from '../../src/domain/coverage.js'
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

describe('uncheckedGroups', () => {
  const alcohol: WatchedGroup = { kind: 'category', path: 'Groceries/Alcohol' }
  const snacks: WatchedGroup = { kind: 'item', item: 'snacks' }
  const groceries = { result: 'created' as const, kind: 'talk', checked_groups: [], lines: [{ category: 'Groceries' }] }

  it('names a watched category under the same top-level category as the purchase', () => {
    expect(uncheckedGroups([alcohol], groceries, [])).toEqual(['Groceries/Alcohol'])
    expect(uncheckedGroups([alcohol], { ...groceries, lines: [{ category: 'Groceries/coffee' }] }, [])).toEqual(['Groceries/Alcohol'])
  })

  it('leaves out a purchase the group is not bought in', () => {
    expect(uncheckedGroups([alcohol], { ...groceries, lines: [{ category: 'Car/Fuel' }] }, [])).toEqual([])
  })

  it('leaves out a group already answered about, whatever its case', () => {
    expect(uncheckedGroups([alcohol], { ...groceries, checked_groups: ['groceries/alcohol'] }, [])).toEqual([])
  })

  it('names a watched item only where the member bought it before', () => {
    expect(uncheckedGroups([snacks], groceries, [])).toEqual([])
    expect(uncheckedGroups([snacks], groceries, [{ item: 'Snacks', category: 'Groceries' }])).toEqual(['snacks'])
    expect(uncheckedGroups([snacks], groceries, [{ item: 'snacks', category: 'Eating out' }])).toEqual([])
  })

  it('waits on statement charges and possible duplicates', () => {
    expect(uncheckedGroups([alcohol], { ...groceries, kind: 'statement' }, [])).toEqual([])
    expect(uncheckedGroups([alcohol], { ...groceries, result: 'possible_duplicate' }, [])).toEqual([])
  })

  it('checks a purchase attached to one already logged', () => {
    expect(uncheckedGroups([alcohol], { ...groceries, result: 'attached', kind: 'email' }, [])).toEqual(['Groceries/Alcohol'])
  })
})
