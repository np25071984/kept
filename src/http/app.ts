import swagger from '@fastify/swagger'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { jsonSchemaTransform, jsonSchemaTransformObject, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { ErrorBody } from '../api/common.js'
import { inHousehold, type Db, type Tx } from '../db/db.js'
import type { Caller } from '../ledger/caller.js'
import { ApiError } from '../ledger/errors.js'
import { API_KEY_PREFIX, authenticate, callerFor, type Mailer } from '../ledger/households.js'
import { loadKeys, type OAuthKeys } from '../oauth/keys.js'
import { createOAuth, SCOPE, verifyAccessToken } from '../oauth/provider.js'
import { oauthRoutes, protectedResourceMetadataUrl } from '../oauth/routes.js'
import { householdRoutes } from './routes/household.js'
import { ledgerRoutes } from './routes/ledger.js'
import { transactionRoutes } from './routes/transactions.js'
import { connectionRoutes } from './routes/connections.js'
import { webRoutes } from './web.js'
import { mcpRoutes } from '../mcp/server.js'

declare module 'fastify' {
  interface FastifyRequest {
    caller: Caller | null
  }
  interface FastifyContextConfig {
    public?: boolean
  }
}

export interface AppDeps {
  db: Db
  mailer: Mailer
  publicUrl: string
  logger?: boolean
  // Proxy hops whose X-Forwarded-For is trusted for request.ip; 0 trusts none.
  trustProxy?: number
  // The built web UI; defaults to dist/web.
  webRoot?: string
  // OAuth2 keys; by default loaded from the database, created on first start.
  oauthKeys?: OAuthKeys
}

export type App = FastifyInstance<any, any, any, any, ZodTypeProvider>

export interface RouteDeps extends AppDeps {
  // Runs `fn` as the authenticated caller, inside a transaction scoped to their household.
  run<T>(request: FastifyRequest, fn: (tx: Tx, caller: Caller) => Promise<T>): Promise<T>
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: (_address: string, hop: number) => hop < (deps.trustProxy ?? 0) }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(swagger, {
    openapi: {
      info: { title: 'Kept', version: '1', description: 'The ledger behind Kept. Every request runs as one household member (docs/IMPLEMENTATION.md §3).' },
      components: { securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', description: 'A per-user API key, "kept_…".' } } },
      security: [{ apiKey: [] }],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  })

  const oauth = createOAuth(deps.db, deps.oauthKeys ?? await loadKeys(deps.db), deps.publicUrl)

  // A bearer token is a member's API key or an OAuth2 access token issued for the MCP address (IMPLEMENTATION.md §4).
  app.decorateRequest('caller', null)
  // Every API route answers an error with the same body (IMPLEMENTATION.md §3).
  const error = { description: 'An error, with a code to act on.', content: { 'application/json': { schema: ErrorBody } } }
  app.addHook('onRoute', (route) => {
    if (!route.url.startsWith('/api/v1/') || route.schema?.hide) return
    route.schema = { ...route.schema, response: { ...(route.schema?.response as object), '4xx': error, '5xx': error } }
  })

  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.config?.public) return
    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    let caller = null
    if (token.startsWith(API_KEY_PREFIX)) caller = await authenticate(deps.db, token)
    else if (token) {
      const userId = await verifyAccessToken(oauth, token)
      caller = userId ? await callerFor(deps.db, userId) : null
    }
    if (!caller) {
      // MCP clients follow resource_metadata to find where to sign in (RFC 9728).
      reply.header('cache-control', 'no-store')
      reply.header('www-authenticate', `Bearer realm="OAuth", resource_metadata="${protectedResourceMetadataUrl(oauth)}", scope="${SCOPE}"${token ? ', error="invalid_token"' : ''}`)
      throw new ApiError(401, 'unauthorized', 'Sign in, or send an API key: "Authorization: Bearer kept_…".')
    }
    request.caller = caller
  })

  app.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number; code?: string }, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.status).send({ error: { code: error.code, message: error.message, ...(error.details && { details: error.details }) } })
    }
    if (error.validation) return reply.status(400).send({ error: { code: 'invalid_request', message: error.message } })
    if (error.code === '23505') return reply.status(409).send({ error: { code: 'conflict', message: 'That already exists.' } })
    if (error.statusCode && error.statusCode < 500) return reply.status(error.statusCode).send({ error: { code: 'invalid_request', message: error.message } })
    request.log.error(error)
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong.' } })
  })

  const routeDeps: RouteDeps = {
    ...deps,
    run(request, fn) {
      const caller = request.caller
      if (!caller) throw new ApiError(401, 'unauthorized', 'Not signed in.')
      return inHousehold(deps.db, caller.household_id, (tx) => fn(tx, caller))
    },
  }

  app.get('/health', { config: { public: true }, schema: { hide: true } }, async () => ({ ok: true }))
  app.get('/api/v1/openapi.json', { config: { public: true }, schema: { hide: true } }, async () => app.swagger())

  transactionRoutes(app, routeDeps)
  ledgerRoutes(app, routeDeps)
  householdRoutes(app, routeDeps)
  connectionRoutes(app, { db: deps.db, oauth })
  mcpRoutes(app)
  oauthRoutes(app, { db: deps.db, mailer: deps.mailer, oauth })
  await webRoutes(app, deps.webRoot)
  return app
}
