import { describe, expect, it } from 'vitest'
import { summarize, type SummaryLine } from '../../src/domain/summary.js'

const line = (merchant: string | null, member: string, amount: number): SummaryLine => ({ date: '2026-10-01', amount, category: 'Groceries', item: null, spent_for: [], merchant, member })

describe('summarize by merchant', () => {
  const lines = [line("Trader Joe's", 'sam', 3000), line("Trader Joe's", 'jo', 2000), line('Sephora', 'jo', 8000), line(null, 'sam', 500)]

  it('totals each merchant for one member', () => {
    expect(summarize(lines, 'merchant', 'total').map((r) => [r.key, r.amount])).toEqual([['Sephora', 8000], ["Trader Joe's", 5000], ['No merchant', 500]])
  })

  it('folds merchants only one member bought from into "Other merchants" for the household', () => {
    expect(summarize(lines, 'merchant', 'total', 2).map((r) => [r.key, r.amount])).toEqual([['Other merchants', 8500], ["Trader Joe's", 5000]])
  })
})
