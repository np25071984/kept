import { acceptInvite, createInvite, deleteInvite, getSetup, issueApiKey, listApiKeys, revokeApiKey, updateMe, updateSetup } from '../../ledger/households.js'
import { listMembers, removeMember, updateMember } from '../../ledger/members.js'
import type { App, RouteDeps } from '../app.js'
import { IdParams } from '../../api/common.js'
import { AcceptBody, ApiKeyBody, InviteBody, MePatch, MemberPatch, SetupPatch } from '../../api/household.js'

export function householdRoutes(app: App, deps: RouteDeps) {
  const { run } = deps

  app.get('/api/v1/setup', {
    schema: { tags: ['setup'], summary: 'The household\'s setup steps and whether the caller has been introduced.' },
  }, async (request) => run(request, (tx, caller) => getSetup(tx, caller)))

  app.patch('/api/v1/setup', {
    schema: { tags: ['setup'], summary: 'Save confirmed setup answers: the household\'s name, currency (before the first transaction) and time zone, owners only; step states; the introduction.', body: SetupPatch },
  }, async (request) => run(request, (tx, caller) => updateSetup(tx, caller, request.body)))

  app.patch('/api/v1/me', {
    schema: { tags: ['setup'], summary: 'Change the caller\'s own name. Returns the setup.', body: MePatch },
  }, async (request) => run(request, (tx, caller) => updateMe(tx, caller, request.body)))

  app.get('/api/v1/members', {
    schema: { tags: ['setup'], summary: 'The household\'s members and open invites.' },
  }, async (request) => run(request, (tx, caller) => listMembers(tx, caller)))

  app.patch('/api/v1/members/:id', {
    schema: { tags: ['setup'], summary: 'Owners only. Make a member an owner or a member; a household keeps at least one owner.', params: IdParams, body: MemberPatch },
  }, async (request) => run(request, (tx, caller) => updateMember(tx, caller, request.params.id, request.body.role)))

  app.delete('/api/v1/members/:id', {
    schema: { tags: ['setup'], summary: 'Owners only. Remove a member and everything they logged; not the last owner.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => removeMember(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.post('/api/v1/invites', {
    schema: { tags: ['setup'], summary: 'Owners only. Invite a member by email; Kept sends the sign-in link.', body: InviteBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => createInvite(tx, caller, request.body.email, deps.mailer, deps.publicUrl))
  })

  app.delete('/api/v1/invites/:id', {
    schema: { tags: ['setup'], summary: 'Cancel an invite that hasn\'t been accepted.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => deleteInvite(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.post('/api/v1/invites/accept', {
    config: { public: true },
    schema: { tags: ['setup'], summary: 'Accept an invite with the token from its link. Creates the member and returns their first API key.', body: AcceptBody, security: [] },
  }, async (request, reply) => {
    reply.status(201)
    return acceptInvite(deps.db, request.body)
  })

  app.get('/api/v1/api-keys', {
    schema: { tags: ['api keys'], summary: 'The caller\'s active API keys.' },
  }, async (request) => ({ api_keys: await run(request, (tx, caller) => listApiKeys(tx, caller)) }))

  app.post('/api/v1/api-keys', {
    schema: { tags: ['api keys'], summary: 'Create an API key for the caller. The key is shown only once.', body: ApiKeyBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => issueApiKey(tx, caller.household_id, caller.user_id, request.body.name))
  })

  app.delete('/api/v1/api-keys/:id', {
    schema: { tags: ['api keys'], summary: 'Revoke one of the caller\'s API keys.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => revokeApiKey(tx, caller, request.params.id))
    return reply.status(204).send()
  })
}