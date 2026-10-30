import { describe, expect, it } from 'vitest'
import { capPeriodKey, keyUnused, needsAssistant, parseQuestionId, questionId, sortQuestions } from '../../src/domain/questions.js'

describe('open questions', () => {
  it('round-trips ids and rejects unknown kinds', () => {
    expect(parseQuestionId(questionId('cap', 'abc'))).toEqual({ kind: 'cap', id: 'abc' })
    expect(parseQuestionId('nope:abc')).toBeNull()
  })

  it('puts duplicates first, then caps, missing charges and keys', () => {
    const q = (kind: 'duplicate' | 'cap' | 'missing_charge' | 'unused_key', created_at: string) => ({ kind, created_at })
    expect(sortQuestions([q('unused_key', '2026-10-01'), q('cap', '2026-10-02'), q('duplicate', '2026-09-01'), q('cap', '2026-10-05')]).map((x) => `${x.kind}@${x.created_at}`))
      .toEqual(['duplicate@2026-09-01', 'cap@2026-10-05', 'cap@2026-10-02', 'unused_key@2026-10-01'])
  })

  it('asks about a key unused for a year, unless kept within it', () => {
    const now = new Date('2026-10-29')
    expect(keyUnused({ created_at: new Date('2025-01-01'), last_used_at: new Date('2025-10-01'), kept_at: null }, now)).toBe(true)
    expect(keyUnused({ created_at: new Date('2025-01-01'), last_used_at: null, kept_at: new Date('2026-01-01') }, now)).toBe(false)
    expect(keyUnused({ created_at: new Date('2026-06-01'), last_used_at: null, kept_at: null }, now)).toBe(false)
  })

  it('silences a cap for its current period', () => {
    expect(capPeriodKey('month', '2026-10-29')).toBe('2026-10')
    expect(capPeriodKey('year', '2026-10-29')).toBe('2026')
  })

  it('asks to connect an assistant while there is none and no API key', () => {
    expect(needsAssistant([], 'kept-web', 0)).toBe(true)
    expect(needsAssistant(['kept-web', 'kept-web'], 'kept-web', 0)).toBe(true)
    expect(needsAssistant(['kept-web', 'claude'], 'kept-web', 0)).toBe(false)
    expect(needsAssistant(['kept-web'], 'kept-web', 1)).toBe(false)
  })

  it('puts connecting an assistant first', () => {
    const at = '2026-10-30T00:00:00Z'
    expect(sortQuestions([{ kind: 'duplicate', created_at: at }, { kind: 'connect', created_at: at }]).map((q) => q.kind)).toEqual(['connect', 'duplicate'])
  })
})