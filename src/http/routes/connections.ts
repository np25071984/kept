import { ClientBody, ClientParams } from '../../api/connections.js'
import type { Db } from '../../db/db.js'
import { checkRedirectUri } from '../../domain/connections.js'
import { invalid, notFound } from '../../ledger/errors.js'
import { disconnect, listConnections, newClientId, saveClient } from '../../oauth/connections.js'
import type { OAuth } from '../../oauth/provider.js'
import type { App } from '../app.js'

// The caller's connected assistants (IMPLEMENTATION.md §5.4). Only the caller's own grants are visible.

export function connectionRoutes(app: App, deps: { db: Db; oauth: OAuth }) {
  const tags = ['connections']

  app.get('/api/v1/connections', {
    schema: { tags, summary: 'Assistants and browsers the caller has signed in, newest use first.' },
  }, async (request) => ({ connections: await listConnections(deps.db, deps.oauth, request.caller!.user_id) }))

  app.delete('/api/v1/connections/:client_id', {
    schema: { tags, summary: 'Disconnect an assistant: its tokens stop working and it has to sign in again.', params: ClientParams },
  }, async (request, reply) => {
    if ((await disconnect(deps.db, request.caller!.user_id, request.params.client_id)) === 0) throw notFound('Connection')
    return reply.status(204).send()
  })

  app.post('/api/v1/connections/clients', {
    schema: { tags, summary: 'Create a client ID and secret for an assistant that asks for them instead of registering itself, such as Gemini. The secret is shown once.', body: ClientBody },
  }, async (request, reply) => {
    const problem = checkRedirectUri(request.body.redirect_uri)
    if (problem) throw invalid('invalid_redirect_uri', problem)
    const name = request.body.name.trim()
    reply.status(201)
    return saveClient(deps.db, { id: newClientId(name), name, redirectUris: [request.body.redirect_uri.trim()] })
  })
}
