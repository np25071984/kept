import type { Tx } from '../db/db.js'
import { memberChangeProblem } from '../domain/members.js'
import type { Caller } from './caller.js'
import { conflict, forbidden, notFound } from './errors.js'

// Settings → Household → Members (VISION.md §3.6): who is in the household and who is invited. Owners change them.

export async function listMembers(tx: Tx, caller: Caller) {
  const members = await tx.selectFrom('users').select(['id', 'name', 'email', 'role', 'created_at']).orderBy('created_at').execute()
  const invites = await tx.selectFrom('invites').select(['id', 'email', 'created_at', 'expires_at']).where('accepted_at', 'is', null).where('expires_at', '>', new Date()).orderBy('created_at').execute()
  return {
    members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, you: m.id === caller.user_id, joined_at: new Date(m.created_at).toISOString() })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, sent_at: new Date(i.created_at).toISOString(), expires_at: new Date(i.expires_at).toISOString() })),
  }
}

async function check(tx: Tx, caller: Caller, id: string, change: Parameters<typeof memberChangeProblem>[3]) {
  const members = await tx.selectFrom('users').select(['id', 'role']).execute()
  const problem = memberChangeProblem(members, caller.user_id, id, change)
  if (!problem) return
  if (problem.code === 'forbidden') throw forbidden(problem.message)
  if (problem.code === 'not_found') throw notFound('Member')
  throw conflict(problem.code, problem.message)
}

export async function updateMember(tx: Tx, caller: Caller, id: string, role: 'owner' | 'member') {
  await check(tx, caller, id, { role })
  await tx.updateTable('users').set({ role }).where('id', '=', id).execute()
  return listMembers(tx, caller)
}

// Removing a member deletes their account and everything they logged; their sign-ins and keys stop working at once.
export async function removeMember(tx: Tx, caller: Caller, id: string) {
  await check(tx, caller, id, 'remove')
  await tx.deleteFrom('users').where('id', '=', id).execute()
}
