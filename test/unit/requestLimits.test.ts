import { describe, expect, it } from 'vitest'
import { countRequest, limitFor, windowOver } from '../../src/domain/requestLimits.js'

describe('limitFor', () => {
  it('groups endpoints by who calls them', () => {
    expect(limitFor('POST', '/oauth/register')?.bucket).toBe('register')
    expect(limitFor('GET', '/oauth/register')).toBeNull()
    expect(limitFor('POST', '/oauth/token')?.bucket).toBe('token')
    expect(limitFor('POST', '/oauth/revoke')?.bucket).toBe('token')
    expect(limitFor('GET', '/oauth/authorize?client_id=x&scope=kept')?.bucket).toBe('authorize')
    expect(limitFor('POST', '/oauth/interaction/abc/email')?.bucket).toBe('signin')
    expect(limitFor('POST', '/mcp')?.bucket).toBe('api')
    expect(limitFor('GET', '/api/v1/transactions?limit=5')?.bucket).toBe('api')
  })

  it('leaves pages and discovery alone', () => {
    for (const url of ['/', '/health', '/app/', '/app/site.css', '/.well-known/oauth-authorization-server', '/oauth/jwks']) expect(limitFor('GET', url), url).toBeNull()
  })

  it("allows a browser fewer sign-in requests than an assistant maker's servers", () => {
    expect(limitFor('GET', '/oauth/authorize')!.max).toBeLessThan(limitFor('POST', '/oauth/token')!.max)
  })
})

describe('countRequest', () => {
  const limit = { bucket: 'test', max: 3, windowMs: 60_000 }

  it('allows requests up to the limit within a window', () => {
    let window = undefined
    const results = []
    for (let i = 0; i < 4; i++) {
      const counted = countRequest(window, limit, 1000 + i)
      window = counted.window
      results.push(counted.allowed)
    }
    expect(results).toEqual([true, true, true, false])
  })

  it('says how long until the window resets', () => {
    expect(countRequest({ start: 0, count: 3 }, limit, 45_000)).toEqual({ window: { start: 0, count: 4 }, allowed: false, retryAfterMs: 15_000 })
  })

  it('starts a new window once the old one has passed', () => {
    expect(countRequest({ start: 0, count: 99 }, limit, 60_000)).toEqual({ window: { start: 60_000, count: 1 }, allowed: true, retryAfterMs: 0 })
  })
})

describe('windowOver', () => {
  it('is true once the window has passed', () => {
    const limit = { bucket: 'test', max: 3, windowMs: 60_000 }
    expect(windowOver({ start: 0, count: 1 }, limit, 59_999)).toBe(false)
    expect(windowOver({ start: 0, count: 1 }, limit, 60_000)).toBe(true)
  })
})
