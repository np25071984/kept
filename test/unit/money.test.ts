import { describe, expect, it } from 'vitest'
import { amountProblem, centsToNumeric, currencyDigits, formatAmount, fromCents, numericToCents, toCents } from '../../src/domain/money.js'

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

  it('knows each currency\'s decimals, at most the two the ledger stores', () => {
    expect(currencyDigits('USD')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('KWD')).toBe(2)
  })

  it('refuses an amount finer than the currency, whatever floating point adds', () => {
    expect(amountProblem(60.4, 'USD')).toBeNull()
    expect(amountProblem(0.1 + 0.2, 'USD')).toBeNull()
    expect(amountProblem(1234567.89, 'EUR')).toBeNull()
    expect(amountProblem(4800, 'JPY')).toBeNull()
    expect(amountProblem(4800.5, 'JPY')).toContain('JPY')
    expect(amountProblem(60.405, 'USD')).toContain('USD')
  })
})
