import { describe, expect, it } from 'vitest'
import { sourceDetails } from '../../web/src/lib/sources.js'

describe('sourceDetails', () => {
  it('shows one total, whatever the assistant called it', () => {
    expect(sourceDetails({ amount: 112.86, total: 112.86 })).toEqual([{ field: 'total', value: 112.86 }])
    expect(sourceDetails({ 'Grand Total': 40 })).toEqual([{ field: 'total', value: 40 }])
  })

  it('prefers the amount Kept recorded when another name disagrees', () => {
    expect(sourceDetails({ total: 99, amount: 112.86 })).toEqual([{ field: 'total', value: 112.86 }])
  })

  it('puts date, total and merchant first, then anything else, and skips what is empty', () => {
    expect(sourceDetails({ account_number: '4417', merchant: null, amount: 5, date: '2026-11-04' })).toEqual([
      { field: 'date', value: '2026-11-04' },
      { field: 'total', value: 5 },
      { field: 'other', name: 'account number', value: '4417' },
    ])
  })

  it('shows nothing when nothing was read', () => {
    expect(sourceDetails(null)).toEqual([])
    expect(sourceDetails({})).toEqual([])
  })
})
