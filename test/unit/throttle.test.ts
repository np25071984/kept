import { describe, expect, it } from 'vitest'
import { CODES_PER_EMAIL, CODES_PER_IP, CODE_WINDOW_MS, codeAllowed } from '../../src/domain/throttle.js'

const now = new Date('2026-10-30T12:00:00Z')
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000)
const times = (n: number, minutes = 5) => Array.from({ length: n }, () => ago(minutes))

describe('codeAllowed', () => {
  it('allows codes until an email has had its hourly share', () => {
    expect(codeAllowed([], [], now)).toBe(true)
    expect(codeAllowed(times(CODES_PER_EMAIL - 1), times(CODES_PER_EMAIL - 1), now)).toBe(true)
    expect(codeAllowed(times(CODES_PER_EMAIL), times(CODES_PER_EMAIL), now)).toBe(false)
  })

  it('limits one IP address across many emails', () => {
    expect(codeAllowed([], times(CODES_PER_IP - 1), now)).toBe(true)
    expect(codeAllowed([], times(CODES_PER_IP), now)).toBe(false)
  })

  it('forgets codes older than the window', () => {
    const old = times(CODES_PER_EMAIL, CODE_WINDOW_MS / 60_000)
    expect(codeAllowed(old, old, now)).toBe(true)
  })
})
