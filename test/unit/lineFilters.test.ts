import { describe, expect, it } from 'vitest'
import { countedAmount, matchedAmount, narrowsLines, type FilteredLine } from '../../src/domain/lineFilters.js'

const lines: FilteredLine[] = [
  { amount: 3000, category: 'Groceries', item: null, spent_for: [] },
  { amount: 1200, category: 'Groceries/Alcohol', item: 'wine', spent_for: [] },
  { amount: 1000, category: 'Household', item: null, spent_for: [{ cost_center: 'Anna', share: null }, { cost_center: 'Kia', share: null }] },
  { amount: 4000, category: 'Car/Fuel', item: null, spent_for: [{ cost_center: 'Kia', share: 0.75 }, { cost_center: 'Anna', share: 0.25 }] },
]

describe('the part of filtered purchases the filters pick out', () => {
  it('counts a category with its subcategories, or alone', () => {
    expect(matchedAmount(lines, { category: ['groceries'] })).toBe(4200)
    expect(matchedAmount(lines, { category_only: ['Groceries'] })).toBe(3000)
    expect(matchedAmount(lines, { category: ['Car'], category_only: ['Groceries'] })).toBe(7000)
    expect(matchedAmount(lines, { category: ['Car/Fuel/'] })).toBe(0)
  })

  it('counts a person or thing by its share, and nobody by the lines for no one', () => {
    expect(matchedAmount(lines, { cost_center: ['kia'] })).toBe(500 + 3000)
    expect(matchedAmount(lines, { cost_center: ['Kia', 'Anna'] })).toBe(5000)
    expect(matchedAmount(lines, { no_cost_center: true })).toBe(4200)
    expect(matchedAmount(lines, { cost_center: ['Anna'], no_cost_center: true })).toBe(500 + 1000 + 4200)
    expect(matchedAmount(lines, { category: ['Car'], cost_center: ['Anna'] })).toBe(1000)
  })

  it('counts one line, or 0 when it does not match', () => {
    expect(countedAmount(lines[3]!, { cost_center: ['Anna'] })).toBe(1000)
    expect(countedAmount(lines[3]!, { category: ['Groceries'] })).toBe(0)
    expect(countedAmount(lines[0]!, { cost_center: ['Anna'] })).toBe(0)
  })

  it('counts an item, and everything without line filters', () => {
    expect(matchedAmount(lines, { item: 'Wine' })).toBe(1200)
    expect(matchedAmount(lines, {})).toBe(9200)
    expect(narrowsLines({})).toBe(false)
    expect(narrowsLines({ category: [] })).toBe(false)
    expect(narrowsLines({ no_cost_center: true })).toBe(true)
  })
})
