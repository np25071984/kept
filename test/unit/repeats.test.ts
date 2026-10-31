import { describe, expect, it } from 'vitest'
import { dueOccurrences, firstNextDate, nextDateAfterChange, occurrence, occurrenceAfter, occurrenceOnOrAfter, stillToCome } from '../../src/domain/repeats.js'

describe('occurrence', () => {
  it('moves the 31st to the last day of shorter months', () => {
    const schedule = { frequency: 'monthly' as const, interval: 1, anchor: '2026-01-31' }
    expect([0, 1, 2, 3].map((k) => occurrence(schedule, k))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('handles every two weeks', () => {
    expect(occurrenceAfter({ frequency: 'weekly', interval: 2, anchor: '2026-10-01' }, '2026-10-01')).toBe('2026-10-15')
  })

  it('moves Feb 29 to Feb 28 in other years', () => {
    expect(occurrence({ frequency: 'yearly', interval: 1, anchor: '2028-02-29' }, 1)).toBe('2029-02-28')
  })

  it('crosses the year end', () => {
    expect(occurrence({ frequency: 'monthly', interval: 1, anchor: '2026-11-27' }, 2)).toBe('2027-01-27')
  })
})

describe('dueOccurrences', () => {
  const repeat = { frequency: 'monthly' as const, interval: 1, anchor: '2026-08-27', next_date: '2026-09-27', ends_on: null, remaining: null, paused: false }

  it('creates every date missed up to today', () => {
    const plan = dueOccurrences(repeat, '2026-11-01')
    expect(plan.dates).toEqual(['2026-09-27', '2026-10-27'])
    expect(plan.next.next_date).toBe('2026-11-27')
    expect(plan.finished).toBe(false)
  })

  it('creates nothing while paused', () => {
    expect(dueOccurrences({ ...repeat, paused: true }, '2026-11-01').dates).toEqual([])
  })

  it('stops after the remaining count', () => {
    const plan = dueOccurrences({ ...repeat, remaining: 1 }, '2026-11-01')
    expect(plan.dates).toEqual(['2026-09-27'])
    expect(plan.finished).toBe(true)
  })

  it('stops after the end date', () => {
    const plan = dueOccurrences({ ...repeat, ends_on: '2026-10-01' }, '2026-11-01')
    expect(plan.dates).toEqual(['2026-09-27'])
    expect(plan.finished).toBe(true)
  })
})

describe('stillToCome', () => {
  const monthly = { frequency: 'monthly' as const, interval: 1, anchor: '2026-01-27', next_date: '2026-10-27', ends_on: null, remaining: null, paused: false, amount: 5500 }
  it('sums what active repeats log for the rest of the month', () => {
    expect(stillToCome([monthly], '2026-10-05')).toBe(5500)
    expect(stillToCome([{ ...monthly, next_date: '2026-11-27' }], '2026-10-29')).toBe(0)
    expect(stillToCome([{ ...monthly, paused: true }], '2026-10-05')).toBe(0)
    const weekly = { ...monthly, frequency: 'weekly' as const, anchor: '2026-10-02', next_date: '2026-10-16', amount: 1000 }
    expect(stillToCome([weekly], '2026-10-16')).toBe(3000)
  })
})

describe('the next date', () => {
  const monthly = { frequency: 'monthly' as const, interval: 1, anchor: '2026-09-27' }

  it('counts the purchase as the first occurrence', () => {
    expect(firstNextDate(monthly, '2026-09-27')).toBe('2026-10-27')
    expect(firstNextDate({ ...monthly, anchor: '2026-10-05' }, '2026-09-27')).toBe('2026-10-05')
  })

  it('takes an occurrence that falls on the date itself', () => {
    expect(occurrenceOnOrAfter(monthly, '2026-10-27')).toBe('2026-10-27')
    expect(occurrenceOnOrAfter(monthly, '2026-10-28')).toBe('2026-11-27')
  })

  it('keeps the date through a plain change, and skips dates missed while paused on resume', () => {
    expect(nextDateAfterChange(monthly, '2026-10-27', '2027-01-03', false)).toBe('2026-10-27')
    expect(nextDateAfterChange(monthly, '2026-10-27', '2027-01-03', true)).toBe('2027-01-27')
    expect(nextDateAfterChange(monthly, '2026-11-27', '2026-10-30', true)).toBe('2026-11-27')
  })
})
