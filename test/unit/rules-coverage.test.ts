import { describe, expect, it } from 'vitest'
import { computeCoverage } from '../../src/domain/coverage.js'
import { resolveRules, type Rule } from '../../src/domain/rules.js'

const rule = (overrides: Partial<Rule>): Rule => ({
  id: Math.random().toString(36), kind: 'set_category', user_id: null, merchant: null, category: null, account_ref: null, params: {}, text: '', ...overrides,
})

describe('resolveRules', () => {
  it('prefers the more specific rule', () => {
    const allFuel = rule({ kind: 'set_spent_for', category: 'Car/Fuel', params: { spent_for: [{ cost_center: 'Hyundai' }] } })
    const shellFuel = rule({ kind: 'set_spent_for', category: 'Car/Fuel', merchant: 'Shell', params: { spent_for: [{ cost_center: 'Kia' }] } })
    const resolved = resolveRules([allFuel, shellFuel], { user_id: 'u1', merchant: 'Shell', category: 'Car/Fuel' })
    expect(resolved.set_spent_for).toBe(shellFuel)
  })

  it('prefers a personal rule at the same specificity', () => {
    const household = rule({ merchant: 'Costco', params: { category: 'Groceries' } })
    const personal = rule({ merchant: 'Costco', user_id: 'u1', params: { category: 'Home' } })
    expect(resolveRules([household, personal], { user_id: 'u1', merchant: 'costco' }).set_category).toBe(personal)
    expect(resolveRules([household, personal], { user_id: 'u2', merchant: 'costco' }).set_category).toBe(household)
  })

  it('applies a category rule to subcategories', () => {
    const watch = rule({ kind: 'watch', category: 'Groceries', params: { item: 'nuts' } })
    expect(resolveRules([watch], { user_id: 'u1', category: 'Groceries/Snacks' }).watch).toEqual([watch])
  })

  it('applies every watch rule once per group', () => {
    const alcohol = rule({ kind: 'watch', params: { category: 'Groceries/Alcohol' } })
    const nuts = rule({ kind: 'watch', params: { item: 'nuts' } })
    const nutsAgain = rule({ kind: 'watch', merchant: 'Whole Foods', params: { item: 'nuts' } })
    expect(resolveRules([alcohol, nuts, nutsAgain], { user_id: 'u1', merchant: 'Whole Foods' }).watch).toHaveLength(2)
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
    const coverage = computeCoverage({ kind: 'item', item: 'nuts' }, [
      { checked_groups: ['nuts'], lines: [{ amount: 1148, category: 'Groceries', item: 'nuts' }, { amount: 2852, category: 'Groceries', item: null }] },
      { checked_groups: ['nuts'], lines: [{ amount: 9500, category: 'Groceries', item: null }] },
    ])
    expect(coverage).toEqual({ group: 'nuts', total: 1148, checked_share: 1, estimate: 1148 })
  })

  it('has no share without base spending', () => {
    expect(computeCoverage({ kind: 'item', item: 'nuts' }, [])).toEqual({ group: 'nuts', total: 0, checked_share: null, estimate: null })
  })
})
