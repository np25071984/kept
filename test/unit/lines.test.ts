import { describe, expect, it } from 'vitest'
import { allocate, buildLines, resizeLines, validateShares } from '../../src/domain/lines.js'

describe('buildLines', () => {
  it('uses the shorthand for a single line', () => {
    const result = buildLines({ amount: 6000, category: 'Car/Fuel', spent_for: [{ cost_center: 'Kia' }] })
    expect(result).toEqual({ ok: true, value: [{ amount: 6000, category: 'Car/Fuel', spent_for: [{ cost_center: 'Kia' }], is_rest: true }] })
  })

  it('adds the rest line in the main category', () => {
    const result = buildLines({
      amount: 4000,
      category: 'Groceries',
      line_items: [
        { amount: 2200, category: 'Clothing', item: 'shoes' },
        { amount: 1200, category: 'Home', item: 'bath curtains' },
      ],
    })
    expect(result.ok && result.value.map((l) => [l.amount, l.category, l.is_rest])).toEqual([
      [2200, 'Clothing', false],
      [1200, 'Home', false],
      [600, 'Groceries', true],
    ])
  })

  it('adds no rest line when the line items cover the total', () => {
    const result = buildLines({ amount: 1000, line_items: [{ amount: 1000, category: 'Home' }] })
    expect(result.ok && result.value).toHaveLength(1)
  })

  it('rejects line items over the total', () => {
    const result = buildLines({ amount: 1000, category: 'Groceries', line_items: [{ amount: 1001, category: 'Home' }] })
    expect(result).toMatchObject({ ok: false, error: 'line_items_exceed_amount' })
  })

  it('needs a category for the rest', () => {
    expect(buildLines({ amount: 1000, line_items: [{ amount: 500, category: 'Home' }] })).toMatchObject({ ok: false, error: 'category_required' })
    expect(buildLines({ amount: 1000 })).toMatchObject({ ok: false, error: 'category_required' })
  })

  it('rejects zero and negative amounts', () => {
    expect(buildLines({ amount: 0, category: 'Home' })).toMatchObject({ ok: false, error: 'invalid_amount' })
  })
})

describe('resizeLines', () => {
  it('lets the rest line absorb a new total', () => {
    const built = buildLines({ amount: 4000, category: 'Groceries', line_items: [{ amount: 2200, category: 'Clothing' }] })
    if (!built.ok) throw new Error('setup')
    const resized = resizeLines(built.value, 4112, 'Groceries')
    expect(resized.ok && resized.value.find((l) => l.is_rest)?.amount).toBe(1912)
  })

  it('fails when explicit lines exceed the new total', () => {
    const built = buildLines({ amount: 4000, category: 'Groceries', line_items: [{ amount: 3000, category: 'Clothing' }] })
    if (!built.ok) throw new Error('setup')
    expect(resizeLines(built.value, 2500, 'Groceries').ok).toBe(false)
  })
})

describe('validateShares', () => {
  it('accepts a share plus a remainder', () => {
    expect(validateShares([{ cost_center: 'Hyundai', share: 0.58 }, { cost_center: 'Kia' }]).ok).toBe(true)
  })

  it('rejects shares over 1', () => {
    expect(validateShares([{ cost_center: 'A', share: 0.7 }, { cost_center: 'B', share: 0.4 }])).toMatchObject({ error: 'shares_exceed_one' })
  })

  it('rejects full shares that leave the unshared entries nothing', () => {
    expect(validateShares([{ cost_center: 'A', share: 1 }, { cost_center: 'B' }])).toMatchObject({ error: 'shares_exceed_one' })
  })

  it('rejects explicit shares that do not add up to 1', () => {
    expect(validateShares([{ cost_center: 'A', share: 0.5 }, { cost_center: 'B', share: 0.3 }])).toMatchObject({ error: 'shares_incomplete' })
  })

  it('rejects a cost center listed twice', () => {
    expect(validateShares([{ cost_center: 'Kia' }, { cost_center: 'kia' }])).toMatchObject({ error: 'duplicate_cost_center' })
  })
})

describe('allocate', () => {
  it('splits evenly by default', () => {
    expect(Object.fromEntries(allocate(90000, [{ cost_center: 'Hyundai' }, { cost_center: 'Kia' }]))).toEqual({ Hyundai: 45000, Kia: 45000 })
  })

  it('applies a share and gives the remainder to the rest', () => {
    expect(Object.fromEntries(allocate(93000, [{ cost_center: 'Hyundai', share: 0.58 }, { cost_center: 'Kia' }]))).toEqual({ Hyundai: 53940, Kia: 39060 })
  })

  it('keeps every cent', () => {
    const split = allocate(1000, [{ cost_center: 'A' }, { cost_center: 'B' }, { cost_center: 'C' }])
    expect([...split.values()].reduce((a, b) => a + b, 0)).toBe(1000)
  })
})
