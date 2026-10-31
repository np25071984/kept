import { describe, expect, it } from 'vitest'
import { checkWhen, dateWarning } from '../../src/domain/dates.js'

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

describe('checkWhen', () => {
  it('takes an IANA zone and a timestamp, and returns the moment in UTC', () => {
    expect(checkWhen({})).toEqual({ ok: true, value: undefined })
    expect(checkWhen({ timezone: 'Asia/Tokyo', occurred_at: null })).toEqual({ ok: true, value: null })
    expect(checkWhen({ occurred_at: '2026-10-01T09:30:00-04:00' })).toEqual({ ok: true, value: '2026-10-01T13:30:00.000Z' })
  })

  it('names what is wrong', () => {
    expect(checkWhen({ timezone: 'Not/AZone' })).toMatchObject({ ok: false, error: 'invalid_timezone' })
    expect(checkWhen({ timezone: 'EST' })).toMatchObject({ ok: false, error: 'invalid_timezone' })
    expect(checkWhen({ occurred_at: 'yesterday' })).toMatchObject({ ok: false, error: 'invalid_occurred_at' })
  })
})
