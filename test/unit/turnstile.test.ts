import { describe, expect, it } from 'vitest'
import { turnstile, turnstilePassed } from '../../src/oauth/turnstile.js'

describe('turnstilePassed', () => {
  it('passes only what Cloudflare confirmed', () => {
    expect(turnstilePassed({ success: true })).toBe(true)
    expect(turnstilePassed({ success: false })).toBe(false)
    expect(turnstilePassed({ success: 'true' })).toBe(false)
    expect(turnstilePassed({})).toBe(false)
  })

  it('lets sign-in through when Cloudflare is unreachable', () => {
    expect(turnstilePassed(null)).toBe(true)
  })
})

describe('turnstile', () => {
  const answering = (status: number, body: unknown, seen: URLSearchParams[] = []) =>
    (async (_url: unknown, init?: RequestInit) => {
      seen.push(init!.body as URLSearchParams)
      return new Response(JSON.stringify(body), { status })
    }) as typeof fetch

  it('sends the secret, token and address, and reads the answer', async () => {
    const seen: URLSearchParams[] = []
    expect(await turnstile('site', 'secret', answering(200, { success: true }, seen)).verify('token', '203.0.113.5')).toBe(true)
    expect(Object.fromEntries(seen[0]!)).toEqual({ secret: 'secret', response: 'token', remoteip: '203.0.113.5' })
    expect(await turnstile('site', 'secret', answering(200, { success: false })).verify('token', '203.0.113.5')).toBe(false)
  })

  it('refuses a form without a token without asking Cloudflare', async () => {
    const seen: URLSearchParams[] = []
    expect(await turnstile('site', 'secret', answering(200, { success: true }, seen)).verify('', '203.0.113.5')).toBe(false)
    expect(seen).toHaveLength(0)
  })

  it('passes when Cloudflare fails or is down', async () => {
    expect(await turnstile('site', 'secret', answering(503, {})).verify('token', '203.0.113.5')).toBe(true)
    expect(await turnstile('site', 'secret', (async () => { throw new Error('offline') }) as typeof fetch).verify('token', '203.0.113.5')).toBe(true)
  })
})
