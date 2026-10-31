import { describe, expect, it } from 'vitest'
import { checkRedirectUri, groupConnections, redirectHost } from '../../src/domain/connections.js'

describe('groupConnections', () => {
  it('shows one connection per assistant, most recently used first', () => {
    expect(groupConnections([
      { client_id: 'gemini', issued_at: 100, last_used_at: 500 },
      { client_id: 'claude', issued_at: 200, last_used_at: null },
      { client_id: 'gemini', issued_at: 300, last_used_at: 400 },
    ])).toEqual([
      { client_id: 'gemini', connected_at: 100, last_used_at: 500 },
      { client_id: 'claude', connected_at: 200, last_used_at: 200 },
    ])
  })
})

describe('redirectHost', () => {
  it('names where the member is sent back to', () => {
    expect(redirectHost('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai')
    expect(redirectHost('http://localhost:7777/callback')).toBe('localhost:7777')
    expect(redirectHost('com.example.app:/oauth')).toBe('com.example.app:/oauth')
  })
})

describe('checkRedirectUri', () => {
  it('takes an https address and explains anything else', () => {
    expect(checkRedirectUri(' https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-1 ')).toBeNull()
    expect(checkRedirectUri('http://example.com/cb')).toBe('The redirect URI must start with https://.')
    expect(checkRedirectUri('gemini')).toBe('Paste the full redirect URI, starting with https://.')
    expect(checkRedirectUri('https://example.com/cb#x')).toBe('A redirect URI has no # part.')
  })
})
