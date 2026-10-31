import { describe, expect, it } from 'vitest'
import { CODES_PER_EMAIL, CODES_PER_IP, CODE_WINDOW_MS, INVITES_PER_DAY, INVITES_PER_HOUR, JOIN_MINUTES, MAX_ATTEMPTS, codeAllowed, inviteAllowed, codeUsable, withinJoinWindow } from '../../src/domain/throttle.js'

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

describe('codeUsable', () => {
  const live = { expires_at: ago(-5), attempts: 1, verified_at: null }

  it('allows tries up to the limit, counting the one being made', () => {
    expect(codeUsable(live, now)).toBe(true)
    expect(codeUsable({ ...live, attempts: MAX_ATTEMPTS }, now)).toBe(true)
    expect(codeUsable({ ...live, attempts: MAX_ATTEMPTS + 1 }, now)).toBe(false)
  })

  it('refuses an expired or already used code', () => {
    expect(codeUsable({ ...live, expires_at: ago(1) }, now)).toBe(false)
    expect(codeUsable({ ...live, verified_at: ago(1) }, now)).toBe(false)
  })
})

describe('withinJoinWindow', () => {
  it('allows joining for a while after the email was verified', () => {
    expect(withinJoinWindow(ago(1), now)).toBe(true)
    expect(withinJoinWindow(ago(JOIN_MINUTES), now)).toBe(true)
    expect(withinJoinWindow(ago(JOIN_MINUTES + 1), now)).toBe(false)
    expect(withinJoinWindow(null, now)).toBe(false)
  })
})

describe('inviteAllowed', () => {
  it('allows invites until the hourly share, then until the daily one', () => {
    expect(inviteAllowed([], now)).toBe(true)
    expect(inviteAllowed(times(INVITES_PER_HOUR - 1), now)).toBe(true)
    expect(inviteAllowed(times(INVITES_PER_HOUR), now)).toBe(false)
    expect(inviteAllowed(times(INVITES_PER_DAY - 1, 120), now)).toBe(true)
    expect(inviteAllowed(times(INVITES_PER_DAY, 120), now)).toBe(false)
  })

  it('forgets invites older than a day', () => {
    expect(inviteAllowed(times(INVITES_PER_DAY, 25 * 60), now)).toBe(true)
  })
})
