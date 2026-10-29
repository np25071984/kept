import { describe, expect, it } from 'vitest'
import { capRange, capReminder, capState } from '../../src/domain/caps.js'

describe('caps', () => {
  it('covers the calendar month or year', () => {
    expect(capRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(capRange('year', '2026-10-29')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('is close from 80% and over past the amount', () => {
    expect(capState(79_999, 100_000)).toBe('under')
    expect(capState(80_000, 100_000)).toBe('close')
    expect(capState(100_000, 100_000)).toBe('close')
    expect(capState(100_001, 100_000)).toBe('over')
  })

  it('reminds once when a purchase passes 80%, and once when it crosses', () => {
    expect(capReminder(70_000, 86_000, 100_000)).toBe('close')
    expect(capReminder(86_000, 90_000, 100_000)).toBeNull()
    expect(capReminder(90_000, 104_000, 100_000)).toBe('over')
    expect(capReminder(70_000, 110_000, 100_000)).toBe('over')
    expect(capReminder(110_000, 120_000, 100_000)).toBeNull()
  })
})
