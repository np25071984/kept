import { describe, expect, it } from 'vitest'
import { dateWarning } from '../../src/domain/dates.js'

describe('dateWarning', () => {
  it('passes recent dates', () => {
    expect(dateWarning('2026-10-28', '2026-10-28', true)).toBeNull()
    expect(dateWarning('2026-08-29', '2026-10-28', true)).toBeNull()
  })

  it('flags a date said in conversation more than 60 days back, the usual wrong-year slip', () => {
    expect(dateWarning('2025-10-25', '2026-10-28', true)).toBe('2025-10-25 is 368 days ago. Check the date with the user, especially the year.')
  })

  it('trusts old dates read from a statement, receipt or email', () => {
    expect(dateWarning('2025-10-25', '2026-10-28', false)).toBeNull()
  })

  it('flags a future date from any source', () => {
    expect(dateWarning('2026-10-29', '2026-10-28', false)).toBe('2026-10-29 is in the future. Check the date with the user.')
  })
})
