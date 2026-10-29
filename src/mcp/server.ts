import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { App } from '../http/app.js'
import { PLAYBOOK } from './playbook.js'
import { playbook, registerTools, type Rest } from './tools.js'

// The MCP server: stateless Streamable HTTP at /mcp. Each request runs as the caller its bearer token authenticates, and
// every tool forwards to the REST API with that same token, so validation and access rules live only there (IMPLEMENTATION.md §5).

export function createMcpServer(rest: Rest): McpServer {
  const server = new McpServer({ name: 'kept', title: 'Kept', version: '1.0.0' }, { instructions: PLAYBOOK })
  registerTools(server, rest)

  server.registerResource('household', 'kept://household', {
    title: 'The household',
    description: 'Categories, people & things, the user\'s notes and watched groups, and setup state, for context before the first question.',
    mimeType: 'application/json',
  }, async (uri) => {
    const { playbook: _, ...household } = await playbook(rest)
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(household) }] }
  })

  const prompt = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] })
  server.registerPrompt('setup_household', {
    title: 'Set up Kept',
    description: 'The first conversation: introduce Kept, people & things, categories, watched groups, invites.',
  }, async () => prompt('Set up Kept for my household. Call get_playbook and follow its first-conversation steps.'))
  server.registerPrompt('log_expense', {
    title: 'Log an expense',
    description: 'Capture, infer, clarify, confirm, log.',
  }, async () => prompt('I want to log an expense. Call get_playbook, then ask me about it following the playbook.'))
  server.registerPrompt('catch_up', {
    title: 'Catch up',
    description: 'Announce updates and resolve possible duplicates and unfiled purchases.',
  }, async () => prompt('Catch me up: call get_playbook and get_updates, tell me what happened, and ask about any possible duplicates.'))

  return server
}

export function mcpRoutes(app: App) {
  app.post('/mcp', { schema: { hide: true } }, async (request, reply) => {
    const authorization = request.headers.authorization!
    const rest: Rest = async (method, url, body) => {
      const response = await app.inject({ method, url, headers: { authorization }, ...(body !== undefined && { payload: body as object }) })
      return { status: response.statusCode, body: response.body ? response.json() : null }
    }
    const server = createMcpServer(rest)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    reply.hijack()
    reply.raw.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(request.raw, reply.raw, request.body)
  })

  // Stateless: no server-initiated stream and no sessions to end.
  const notAllowed = { error: { code: 'method_not_allowed', message: 'Kept\'s MCP endpoint is stateless; use POST.' } }
  app.get('/mcp', { schema: { hide: true } }, async (_request, reply) => reply.status(405).header('allow', 'POST').send(notAllowed))
  app.delete('/mcp', { schema: { hide: true } }, async (_request, reply) => reply.status(405).header('allow', 'POST').send(notAllowed))
}