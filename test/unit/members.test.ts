import { describe, expect, it } from 'vitest'
import { accountDeletion, confirmsEmail, memberChangeProblem } from '../../src/domain/members.js'

const sam = { id: 'sam', role: 'owner' as const }
const jo = { id: 'jo', role: 'member' as const }

describe('memberChangeProblem', () => {
  it('lets an owner promote, demote and remove', () => {
    expect(memberChangeProblem([sam, jo], 'sam', 'jo', { role: 'owner' })).toBeNull()
    expect(memberChangeProblem([sam, { ...jo, role: 'owner' }], 'sam', 'sam', { role: 'member' })).toBeNull()
    expect(memberChangeProblem([sam, jo], 'sam', 'jo', 'remove')).toBeNull()
  })

  it('refuses members and keeps the last owner', () => {
    expect(memberChangeProblem([sam, jo], 'jo', 'sam', 'remove')?.code).toBe('forbidden')
    expect(memberChangeProblem([sam, jo], 'sam', 'sam', 'remove')?.code).toBe('last_owner')
    expect(memberChangeProblem([sam, jo], 'sam', 'sam', { role: 'member' })?.code).toBe('last_owner')
    expect(memberChangeProblem([sam, jo], 'sam', 'nobody', 'remove')?.code).toBe('not_found')
  })
})

describe('accountDeletion', () => {
  it('deletes only the account of a member, or of an owner with another owner beside them', () => {
    expect(accountDeletion([sam, jo], 'jo')).toEqual({ deletes: 'account' })
    expect(accountDeletion([sam, { ...jo, role: 'owner' }], 'sam')).toEqual({ deletes: 'account' })
  })

  it('makes the only owner hand over while others remain', () => {
    expect(accountDeletion([sam, jo], 'sam')).toMatchObject({ code: 'last_owner' })
  })

  it('takes the household with its only member', () => {
    expect(accountDeletion([sam], 'sam')).toEqual({ deletes: 'household' })
  })

  it('confirms by the email, ignoring case and spaces', () => {
    expect(confirmsEmail(' SAM@example.com ', 'sam@example.com')).toBe(true)
    expect(confirmsEmail('jo@example.com', 'sam@example.com')).toBe(false)
  })
})
