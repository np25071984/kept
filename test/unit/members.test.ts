import { describe, expect, it } from 'vitest'
import { memberChangeProblem } from '../../src/domain/members.js'

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
