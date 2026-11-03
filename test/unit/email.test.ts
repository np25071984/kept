import { describe, expect, it } from 'vitest'
import { humanCheckNeeded, validEmail } from '../../src/domain/email.js'

describe('validEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const email of ['sam@example.com', 'sam.smith+kept@mail.example.co.uk', 'o\'neil@example.org', 'анна@почта.рф', 'x@xn--p1ai.com']) expect(validEmail(email), email).toBe(true)
  })

  it('refuses what only looks like an address', () => {
    for (const email of ['', 'sam', 'sam@', '@example.com', 'sam@localhost', 'sam@example', 'sam@example.c', 'sam@example.123', 'sam @example.com', 'sam@exa mple.com', '.sam@example.com', 'sam.@example.com', 'sa..m@example.com', 'sam@-example.com', 'sam@example-.com', 'sam@example..com', 'a@b@example.com', '"sam"@example.com']) expect(validEmail(email), email).toBe(false)
  })

  it('refuses addresses longer than mail allows', () => {
    expect(validEmail(`${'a'.repeat(64)}@example.com`)).toBe(true)
    expect(validEmail(`${'a'.repeat(65)}@example.com`)).toBe(false)
    expect(validEmail(`sam@${'a'.repeat(63)}.com`)).toBe(true)
    expect(validEmail(`sam@${'a'.repeat(64)}.com`)).toBe(false)
    expect(validEmail(`sam@${Array.from({ length: 5 }, () => 'a'.repeat(60)).join('.')}.com`)).toBe(false)
  })
})

describe('humanCheckNeeded', () => {
  it('skips the check only to resend to the address that passed it', () => {
    expect(humanCheckNeeded(null, 'sam@example.com')).toBe(true)
    expect(humanCheckNeeded('sam@example.com', 'sam@example.com')).toBe(false)
    expect(humanCheckNeeded('sam@example.com', ' Sam@Example.com ')).toBe(false)
    expect(humanCheckNeeded('sam@example.com', 'zoe@example.com')).toBe(true)
  })
})
