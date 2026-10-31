import { describe, expect, it } from 'vitest'
import { planEdit, type Editable } from '../../src/domain/edits.js'

// $40 at Target: $22 of shoes for Zoe, the rest groceries.
const target: Editable = {
  amount: 4000,
  main_category: 'Groceries',
  user_edited: [],
  lines: [
    { amount: 2200, category: 'Clothing', item: 'shoes', spent_for: [{ cost_center: 'Zoe' }], is_rest: false },
    { amount: 1800, category: 'Groceries', spent_for: [], is_rest: true },
  ],
}

const plan = (edit: Parameters<typeof planEdit>[1], existing = target) => {
  const result = planEdit(existing, edit)
  if (!result.ok) throw new Error(result.message)
  return result.value
}

describe('planEdit', () => {
  it('lets the rest line absorb a new amount, and records the amount as the user\'s', () => {
    const edited = plan({ amount: 4120 })
    expect(edited.lines.map((l) => l.amount)).toEqual([2200, 1920])
    expect(edited.user_edited).toEqual(['amount'])
  })

  it('keeps the lines untouched when only other fields change', () => {
    const edited = plan({ merchant: 'Target #12', date: '2026-10-25' })
    expect(edited.lines).toBe(target.lines)
    expect(edited.user_edited).toEqual(['date', 'merchant'])
  })

  it('rebuilds the lines around a new main category and keeps earlier edits', () => {
    const edited = plan({ category: 'Household' }, { ...target, user_edited: ['merchant'] })
    expect(edited.main_category).toBe('Household')
    expect(edited.lines.at(-1)).toMatchObject({ amount: 1800, category: 'Household', is_rest: true })
    expect(edited.user_edited).toEqual(['merchant', 'line_items'])
  })

  it('replaces the explicit line items and keeps the rest line\'s split', () => {
    const edited = plan({ line_items: [{ amount: 1000, category: 'Clothing', item: 'socks' }] })
    expect(edited.lines).toMatchObject([{ amount: 1000, item: 'socks' }, { amount: 3000, category: 'Groceries', is_rest: true }])
  })

  it('refuses lines past the amount and a malformed date', () => {
    expect(planEdit(target, { amount: 2000 })).toMatchObject({ ok: false, error: 'line_items_exceed_amount' })
    expect(planEdit(target, { date: '2026-02-30' })).toMatchObject({ ok: false, error: 'invalid_date' })
  })
})
