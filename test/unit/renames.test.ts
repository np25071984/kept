import { describe, expect, it } from 'vitest'
import type { RepeatTemplate } from '../../src/db/schema.js'
import {
  categoryRenamer, checkCategoryRename, checkCostCenterRename, costCenterRenamer, mentions, renamePath, renameRuleParams, renameTemplate, usageProblem,
} from '../../src/domain/renames.js'

const paths = ['Car', 'Car/Fuel', 'Car/Fuel/Diesel', 'Groceries', 'Groceries/Alcohol', 'Other']

describe('renamePath', () => {
  it('renames a category and everything under it, ignoring case', () => {
    expect(renamePath('car/fuel', 'Car', 'Auto')).toBe('Auto/fuel')
    expect(renamePath('Car', 'car', 'Auto')).toBe('Auto')
    expect(renamePath('Carpets', 'Car', 'Auto')).toBe('Carpets')
  })
})

describe('checkCategoryRename', () => {
  it('allows a new name, a case fix and a move under an existing parent', () => {
    expect(checkCategoryRename('Car', 'Auto', paths)).toBeNull()
    expect(checkCategoryRename('Car', 'car', paths)).toBeNull()
    expect(checkCategoryRename('Groceries/Alcohol', 'Other/Alcohol', paths)).toBeNull()
  })

  it('refuses a taken name, a missing parent, a move under itself and a tree too deep', () => {
    expect(checkCategoryRename('Car', 'Other', paths)?.code).toBe('category_exists')
    expect(checkCategoryRename('Other', 'Home/Other', paths)?.code).toBe('unknown_category')
    expect(checkCategoryRename('Car', 'Car/Old', paths)?.message).toContain('under itself')
    expect(checkCategoryRename('Car', 'Other/Car', paths)?.message).toContain('Other/Car/Fuel/Diesel')
    expect(checkCategoryRename('Boats', 'Ships', paths)?.code).toBe('unknown_category')
  })
})

describe('checkCostCenterRename', () => {
  it('fixes a typo but not onto another cost center', () => {
    expect(checkCostCenterRename('Iva', 'Ivy', ['Iva', 'Maya'])).toBeNull()
    expect(checkCostCenterRename('Iva', 'maya', ['Iva', 'Maya'])?.code).toBe('cost_center_exists')
    expect(checkCostCenterRename('Iva', ' ', ['Iva'])?.code).toBe('invalid_cost_center')
  })
})

describe('renaming text references', () => {
  const template: RepeatTemplate = {
    amount: 100, merchant: 'Geico', notes: null, private: false, category: 'Car',
    line_items: [{ amount: 100, category: 'Car/Fuel', spent_for: [{ cost_center: 'Iva', share: 0.5 }, { cost_center: 'Kia', share: 0.5 }] }],
  }

  it('rewrites rule params', () => {
    expect(renameRuleParams({ category: 'Car/Fuel' }, categoryRenamer('Car', 'Auto'))).toEqual({ category: 'Auto/Fuel' })
    expect(renameRuleParams({ spent_for: [{ cost_center: 'iva', share: 1 }] }, costCenterRenamer('Iva', 'Ivy'))).toEqual({ spent_for: [{ cost_center: 'Ivy', share: 1 }] })
  })

  it('rewrites repeat templates', () => {
    const renamed = renameTemplate(template, categoryRenamer('Car', 'Auto'))
    expect(renamed.category).toBe('Auto')
    expect(renamed.line_items[0]!.category).toBe('Auto/Fuel')
    expect(renameTemplate(template, costCenterRenamer('Iva', 'Ivy')).line_items[0]!.spent_for).toEqual([{ cost_center: 'Ivy', share: 0.5 }, { cost_center: 'Kia', share: 0.5 }])
  })

  it('tells whether params or a template mention a name', () => {
    expect(mentions(costCenterRenamer('Iva', '\0'), { template })).toBe(true)
    expect(mentions(costCenterRenamer('Maya', '\0'), { template })).toBe(false)
    expect(mentions(categoryRenamer('Car/Fuel', '\0'), { params: { category: 'Car/Fuel/Diesel' } })).toBe(true)
  })
})

describe('usageProblem', () => {
  it('lets an unused name go and lists what still uses one', () => {
    expect(usageProblem('', 'Iva', { purchases: 0, rules: 0 })).toBeNull()
    expect(usageProblem('Category ', 'Car', { purchases: 1, subcategories: 2, rules: 0 })?.message).toBe(
      'Category "Car" is still used by 1 purchase, 2 subcategories. Move or change those first, or rename it instead.',
    )
  })
})
