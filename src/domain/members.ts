import type { Problem } from './renames.js'

// Who may change a member's role or remove them (VISION.md §3.6): owners only, and a household always keeps an owner.

export interface Member {
  id: string
  role: 'owner' | 'member'
}

export function memberChangeProblem(members: Member[], callerId: string, targetId: string, change: { role: 'owner' | 'member' } | 'remove'): Problem | null {
  const caller = members.find((m) => m.id === callerId)
  const target = members.find((m) => m.id === targetId)
  if (caller?.role !== 'owner') return { code: 'forbidden', message: 'Only an owner can change members.' }
  if (!target) return { code: 'not_found', message: 'Member not found.' }
  const owners = members.filter((m) => m.role === 'owner').length
  const losesOwner = target.role === 'owner' && (change === 'remove' || change.role === 'member')
  if (losesOwner && owners === 1) return { code: 'last_owner', message: 'A household needs an owner: make someone else an owner first.' }
  return null
}
