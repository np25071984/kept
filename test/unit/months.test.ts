import { describe, expect, it } from 'vitest'
import { shiftMonths } from '../../src/domain/months.js'

describe('shiftMonths', () => {
  it('goes back across years and lands on the last day a shorter month has', () => {
    expect(shiftMonths('2026-03-15', 1)).toBe('2026-02-15')
    expect(shiftMonths('2026-01-10', 2)).toBe('2025-11-10')
    expect(shiftMonths('2026-03-31', 1)).toBe('2026-02-28')
    expect(shiftMonths('2024-03-31', 1)).toBe('2024-02-29')
    expect(shiftMonths('2026-10-31', -1)).toBe('2026-11-30')
  })
})
