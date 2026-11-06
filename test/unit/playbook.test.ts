import { describe, expect, it } from 'vitest'
import { PLAYBOOK, webPages } from '../../src/mcp/playbook.js'

describe('webPages', () => {
  it('builds each address under the server\'s /app', () => {
    expect(webPages('https://kept.example')).toEqual({
      home: 'https://kept.example/app/',
      purchases: 'https://kept.example/app/purchases',
      reports_mine: 'https://kept.example/app/reports/mine',
      reports_household: 'https://kept.example/app/reports/household',
    })
  })

  it('accepts a trailing slash on the public URL', () => {
    expect(webPages('https://kept.example/').home).toBe('https://kept.example/app/')
  })

  it('has a page for every one the playbook names', () => {
    const named = [...PLAYBOOK.matchAll(/web_pages\.(\w+)/g)].map((m) => m[1]!)
    expect(named.length).toBeGreaterThan(0)
    expect(Object.keys(webPages('https://kept.example'))).toEqual(expect.arrayContaining(named))
  })
})
