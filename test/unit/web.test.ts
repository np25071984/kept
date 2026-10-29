import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { formFromTransaction, patchFromForm, restCents, validateForm, type PurchaseForm } from '../../web/src/lib/editor.js'
import { formatDate, formatMoney, parseAmount } from '../../web/src/lib/money.js'
import { challengeFor, randomString } from '../../web/src/lib/pkce.js'
import type { Transaction } from '../../web/src/lib/types.js'

const target: Transaction = {
  id: 't1', date: '2026-10-25', occurred_at: null, timezone: 'America/New_York', amount: 40, merchant: 'Target', notes: null, private: false,
  category: 'Groceries', repeat_id: null, checked_groups: [], sources: [],
  line_items: [
    { amount: 22, category: 'Clothing', item: 'shoes', notes: null, rest: false, spent_for: [{ cost_center: 'Zoe', share: null }] },
    { amount: 18, category: 'Groceries', item: null, notes: null, rest: true, spent_for: [{ cost_center: 'Hyundai', share: 0.58 }, { cost_center: 'Kia', share: null }] },
  ],
}

describe('purchase editor', () => {
  it('edits the explicit lines and treats the rest line as what they leave', () => {
    const form = formFromTransaction(target)
    expect(form).toMatchObject({ amount: '40.00', category: 'Groceries', lines: [{ amount: '22.00', category: 'Clothing', item: 'shoes' }] })
    expect(form.spent_for).toEqual([{ cost_center: 'Hyundai', share: '58' }, { cost_center: 'Kia', share: '' }])
    expect(restCents(form)).toBe(1800)
    expect(validateForm(form)).toEqual([])
  })

  it('turns the form back into a PATCH body', () => {
    const form: PurchaseForm = { ...formFromTransaction(target), amount: '41.20', merchant: ' Target ', notes: '' }
    expect(patchFromForm(form)).toEqual({
      date: '2026-10-25', amount: 41.2, merchant: 'Target', notes: null, private: false, category: 'Groceries',
      spent_for: [{ cost_center: 'Hyundai', share: 0.58 }, { cost_center: 'Kia' }],
      line_items: [{ amount: 22, category: 'Clothing', item: 'shoes', spent_for: [{ cost_center: 'Zoe' }] }],
    })
  })

  it('explains what is wrong before anything is sent', () => {
    const form = formFromTransaction(target)
    expect(validateForm({ ...form, amount: '20' })).toContain('The lines add up to more than the amount.')
    expect(validateForm({ ...form, category: '' })).toContain('Pick a category for the rest of the amount.')
    expect(validateForm({ ...form, amount: 'abc' })).toContain('The amount must be a number above zero, like 12.50.')
    expect(validateForm({ ...form, spent_for: [{ cost_center: 'Hyundai', share: '70' }, { cost_center: 'Kia', share: '40' }] })).toContain('Shares for the rest add up to more than 100%.')
    expect(validateForm({ ...form, spent_for: [{ cost_center: 'Hyundai', share: '50' }, { cost_center: 'hyundai', share: '' }] })).toContain('A cost center appears twice for the rest.')
  })
})

describe('money and dates', () => {
  it('parses what people type and formats for display', () => {
    expect(parseAmount('$1,234.5')).toBe(123450)
    expect(parseAmount('12.345')).toBeNull()
    expect(formatMoney(10.79, 'USD')).toBe('$10.79')
    expect(formatDate('2026-10-25')).toBe('Sun, Oct 25, 2026')
  })
})

describe('PKCE', () => {
  it('derives the S256 challenge: base64url of the verifier\'s SHA-256, unpadded', async () => {
    const verifier = randomString()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await challengeFor(verifier)).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })
})
