import { describe, expect, it } from 'vitest'
import { centsToNumeric, formatAmount, fromCents, numericToCents, toCents } from '../../src/domain/money.js'

describe('money', () => {
  it('rounds to whole cents, whatever floating point adds', () => {
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(4.35)).toBe(435)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(fromCents(1999)).toBe(19.99)
  })

  it('reads and writes PostgreSQL numeric strings', () => {
    expect(numericToCents('60.00')).toBe(6000)
    expect(numericToCents('0.07')).toBe(7)
    expect(centsToNumeric(6120)).toBe('61.20')
  })

  it('formats in the currency', () => {
    expect(formatAmount(5000, 'USD')).toBe('$50.00')
    expect(formatAmount(123456, 'EUR')).toBe('€1,234.56')
  })
})
