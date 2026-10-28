import { describe, expect, it } from 'vitest'
import { decideMatch, reconcile, type ExistingTransaction, type MatchCandidate } from '../../src/domain/matching.js'
import { relateMerchants } from '../../src/domain/merchants.js'

const talk = (overrides: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id: 't1', date: '2026-10-25', amount: 6000, merchant: 'Shell', repeated: false,
  sources: [{ kind: 'talk', amount: 6000 }], ...overrides,
})

describe('relateMerchants', () => {
  it('treats bank descriptors as unknown, not different', () => {
    expect(relateMerchants('Blue Bottle', 'SQ *BLUE BTL 0423')).toBe('same')
    expect(relateMerchants('Blue Bottle', 'SQ *BB COFFEE 0423')).toBe('unknown')
    expect(relateMerchants('Shell', 'SHELL OIL 57444')).toBe('same')
    expect(relateMerchants('Target', 'Whole Foods')).toBe('different')
    expect(relateMerchants("Trader Joe's", 'trader joes')).toBe('same')
  })
})

describe('decideMatch', () => {
  it('attaches a statement charge with a small difference', () => {
    expect(decideMatch([talk()], { kind: 'statement', date: '2026-10-27', amount: 6120, merchant: 'SHELL OIL 57444' })).toEqual({ kind: 'attach', id: 't1' })
  })

  it('flags an unclear match as a possible duplicate', () => {
    const target = talk({ merchant: 'Target', amount: 4000 })
    expect(decideMatch([target], { kind: 'statement', date: '2026-10-27', amount: 4112, merchant: null })).toEqual({ kind: 'possible_duplicate', id: 't1' })
  })

  it('never matches two reports of the same kind', () => {
    expect(decideMatch([talk()], { kind: 'talk', date: '2026-10-25', amount: 6000, merchant: 'Shell' })).toEqual({ kind: 'create' })
  })

  it('ignores a different merchant and a far date', () => {
    expect(decideMatch([talk()], { kind: 'statement', date: '2026-10-25', amount: 6000, merchant: 'Costco' })).toEqual({ kind: 'create' })
    expect(decideMatch([talk()], { kind: 'statement', date: '2026-11-10', amount: 6000, merchant: 'Shell' })).toEqual({ kind: 'create' })
  })

  it('finds a purchase the user edited down by its original source amount', () => {
    const edited = talk({ merchant: 'Target', amount: 1800, sources: [{ kind: 'talk', amount: 4000 }] })
    expect(decideMatch([edited], { kind: 'statement', date: '2026-10-26', amount: 4000, merchant: 'TARGET 00012' })).toEqual({ kind: 'attach', id: 't1' })
  })

  it('matches a repeat to a real bill with a different amount', () => {
    const repeat = talk({ merchant: 'Con Edison', amount: 13200, repeated: true, sources: [] })
    expect(decideMatch([repeat], { kind: 'email', date: '2026-10-28', amount: 15000, merchant: 'Con Edison' })).toEqual({ kind: 'attach', id: 't1' })
  })

  it('does not guess between two clear candidates', () => {
    const decision = decideMatch([talk({ id: 'a' }), talk({ id: 'b' })], { kind: 'statement', date: '2026-10-25', amount: 6000, merchant: 'SHELL' })
    expect(decision.kind).toBe('possible_duplicate')
  })
})

describe('reconcile', () => {
  const existing: ExistingTransaction = {
    amount: 4000, date: '2026-10-25', merchant: 'Target', main_category: 'Groceries',
    lines: [
      { amount: 2200, category: 'Clothing', item: 'shoes', is_rest: false },
      { amount: 1800, category: 'Groceries', is_rest: true },
    ],
    checked_groups: [], private: false, user_edited: [], source_kinds: ['talk'],
  }

  it('takes amount and date from the statement and resizes the rest line', () => {
    const result = reconcile(existing, { kind: 'statement', amount: 4112, date: '2026-10-27', merchant: 'TARGET 00012', lines: [{ amount: 4112, category: 'Groceries', is_rest: true }], checked_groups: [], private: false })
    expect(result.amount).toBe(4112)
    expect(result.date).toBe('2026-10-27')
    expect(result.merchant).toBe('Target')
    expect(result.lines.find((l) => l.is_rest)?.amount).toBe(1912)
  })

  it('keeps the user\'s own edits', () => {
    const result = reconcile({ ...existing, amount: 1800, user_edited: ['amount'] }, { kind: 'statement', amount: 4000, date: '2026-10-25', merchant: null, lines: [], checked_groups: [], private: false })
    expect(result.amount).toBe(1800)
    expect(result.kept).toEqual([expect.objectContaining({ field: 'amount', reason: 'user_edit' })])
  })

  it('takes line items from a receipt over talk', () => {
    const result = reconcile(existing, { kind: 'photo', amount: 4000, date: '2026-10-25', merchant: 'Target', lines: [{ amount: 1148, category: 'Groceries/Snacks', item: 'nuts', is_rest: false }, { amount: 2852, category: 'Groceries', is_rest: true }], checked_groups: ['nuts'], private: false })
    expect(result.lines.map((l) => l.amount)).toEqual([1148, 2852])
    expect(result.checked_groups).toEqual(['nuts'])
  })

  it('does not take amounts from talk over a statement', () => {
    const result = reconcile({ ...existing, source_kinds: ['statement'] }, { kind: 'talk', amount: 4500, date: '2026-10-24', merchant: null, lines: [], checked_groups: [], private: false })
    expect(result.amount).toBe(4000)
    expect(result.changes).toEqual([])
  })

  it('takes the category and cost centers from talk over a statement', () => {
    const fromStatement = { ...existing, lines: [{ amount: 4000, category: 'Other', is_rest: true }], source_kinds: ['statement' as const] }
    const result = reconcile(fromStatement, { kind: 'talk', amount: 4000, date: '2026-10-25', merchant: null, lines: [{ amount: 4000, category: 'Car/Fuel', spent_for: [{ cost_center: 'Kia' }], is_rest: true }], checked_groups: [], private: true })
    expect(result.lines).toEqual([{ amount: 4000, category: 'Car/Fuel', spent_for: [{ cost_center: 'Kia' }], is_rest: true }])
    expect(result.private).toBe(true)
  })
})
