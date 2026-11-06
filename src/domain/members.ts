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

// What deleting the caller's own account does (VISION.md §4.C). A household needs an owner, so its only owner
// hands over first, unless nobody else is left, when the household goes too.
export function accountDeletion(members: Member[], callerId: string): { deletes: 'account' | 'household' } | Problem {
  const caller = members.find((m) => m.id === callerId)
  if (!caller) return { code: 'not_found', message: 'Member not found.' }
  if (members.length === 1) return { deletes: 'household' }
  const owners = members.filter((m) => m.role === 'owner').length
  if (caller.role === 'owner' && owners === 1) return { code: 'last_owner', message: 'A household needs an owner: make someone else an owner first.' }
  return { deletes: 'account' }
}

export function confirmsEmail(typed: string, email: string): boolean {
  return typed.trim().toLowerCase() === email.trim().toLowerCase()
}
