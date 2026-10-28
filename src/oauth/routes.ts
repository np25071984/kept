import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Db } from '../db/db.js'
import type { App } from '../http/app.js'
import type { Mailer } from '../ledger/households.js'
import { codePage, consentPage, emailPage, errorPage, joinPage } from './pages.js'
import { SCOPE, type OAuth } from './provider.js'
import { invitedHousehold, joinWithVerifiedEmail, sendCode, verifyCode } from './signin.js'

// OAuth2 endpoints for MCP clients (IMPLEMENTATION.md §5, §6): protected resource metadata, oidc-provider's endpoints, and
// the sign-in and consent pages it hands interactions to.

export function protectedResourceMetadataUrl(oauth: OAuth): string {
  return `${oauth.issuer}/.well-known/oauth-protected-resource/mcp`
}

const OAUTH_METADATA = [
  'issuer',
  'authorization_endpoint',
  'token_endpoint',
  'registration_endpoint',
  'revocation_endpoint',
  'scopes_supported',
  'response_types_supported',
  'grant_types_supported',
  'code_challenge_methods_supported',
  'authorization_response_iss_parameter_supported',
  'client_id_metadata_document_supported',
]

export function authorizationServerMetadata(openid: Record<string, unknown>, resource: string, resourceMetadata: string): Record<string, unknown> {
  const metadata = Object.fromEntries(OAUTH_METADATA.filter((key) => key in openid).map((key) => [key, openid[key]]))
  return {
    ...metadata,
    scopes_supported: [SCOPE],
    // Codes come back in the query string; Kept offers no OpenID browser flows.
    response_modes_supported: ['query'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    protected_resources: [resource],
    resource,
    resource_metadata: resourceMetadata,
  }
}

export function oauthRoutes(app: App, deps: { db: Db; mailer: Mailer; oauth: OAuth }) {
  const { provider } = deps.oauth
  const callback = provider.callback()
  const forward = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.hijack()
    await callback(request.raw, reply.raw)
  }

  // RFC 9728: where an MCP client learns which authorization server issues tokens for /mcp.
  const metadata = {
    resource: deps.oauth.resource,
    authorization_servers: [deps.oauth.issuer],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Kept',
  }
  for (const url of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    app.get(url, { config: { public: true }, schema: { hide: true } }, async (_request, reply) => reply.header('access-control-allow-origin', '*').send(metadata))
  }

  // oidc-provider reads request bodies itself, so these routes leave them unparsed.
  app.register(async (scope) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('*', (_request, _payload, done) => done(null))
    const options = { config: { public: true }, schema: { hide: true } }
    scope.route({ method: ['GET', 'POST', 'OPTIONS', 'DELETE', 'PUT'], url: '/oauth/*', ...options, handler: forward })
    scope.route({ method: ['GET', 'OPTIONS'], url: '/.well-known/openid-configuration', ...options, handler: forward })
  })

  // RFC 8414 metadata for MCP clients: the OAuth part of the OpenID document, pointing back to /mcp (RFC 9728 §4).
  app.get('/.well-known/oauth-authorization-server', { config: { public: true }, schema: { hide: true } }, async (request, reply) => {
    const headers = { host: request.headers.host ?? '', 'x-forwarded-proto': request.headers['x-forwarded-proto'] ?? request.protocol }
    const openid = (await app.inject({ method: 'GET', url: '/.well-known/openid-configuration', headers })).json()
    return reply.header('access-control-allow-origin', '*').send(authorizationServerMetadata(openid, deps.oauth.resource, protectedResourceMetadataUrl(deps.oauth)))
  })

  app.register(async (scope) => {
    scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)))
    })
    const options = { config: { public: true }, schema: { hide: true } }
    type Form = Record<string, string | undefined>
    const html = (reply: FastifyReply, body: string, status = 200) => reply.status(status).type('text/html; charset=utf-8').header('cache-control', 'no-store').send(body)
    const details = async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await provider.interactionDetails(request.raw, reply.raw)
      } catch {
        return null
      }
    }
    const clientName = async (clientId: unknown) => (await provider.Client.find(String(clientId)))?.clientName ?? 'Your assistant'
    const finish = async (request: FastifyRequest, reply: FastifyReply, result: Parameters<typeof provider.interactionResult>[2], merge = false) => {
      const location = await provider.interactionResult(request.raw, reply.raw, result, { mergeWithLastSubmission: merge })
      return reply.status(303).header('location', location).send()
    }
    const expired = (reply: FastifyReply) => html(reply, errorPage('This sign-in has expired.'), 400)

    scope.get<{ Params: { uid: string } }>('/oauth/interaction/:uid', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid) return expired(reply)
      if (interaction.prompt.name === 'login') return html(reply, emailPage(interaction.uid, await clientName(interaction.params.client_id)))
      return html(reply, consentPage(interaction.uid, await clientName(interaction.params.client_id)))
    })

    scope.post<{ Params: { uid: string }; Body: Form }>('/oauth/interaction/:uid/email', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid) return expired(reply)
      const email = (request.body?.email ?? '').trim()
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) return html(reply, emailPage(interaction.uid, await clientName(interaction.params.client_id), 'Enter a valid email.'), 400)
      const link = (code: string) => `${deps.oauth.issuer}/oauth/interaction/${interaction.uid}/code?code=${code}`
      await sendCode(deps.db, deps.mailer, interaction.uid, email, link)
      return html(reply, codePage(interaction.uid, email))
    })

    const verify = async (request: FastifyRequest<{ Params: { uid: string } }>, reply: FastifyReply, code: string) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid) return expired(reply)
      const verified = await verifyCode(deps.db, interaction.uid, code)
      if (verified.kind === 'user') return finish(request, reply, { login: { accountId: verified.user_id } })
      if (verified.kind === 'invite') return html(reply, joinPage(interaction.uid, verified.invite.household_name, verified.invite.inviter_name))
      return html(reply, codePage(interaction.uid, 'your email', 'That code is wrong or expired. Check it, or send a new one.'), 400)
    }
    scope.post<{ Params: { uid: string }; Body: Form }>('/oauth/interaction/:uid/code', options, async (request, reply) => verify(request, reply, request.body?.code ?? ''))
    // The emailed link: works when opened in the browser that started sign-in.
    scope.get<{ Params: { uid: string }; Querystring: Form }>('/oauth/interaction/:uid/code', options, async (request, reply) => verify(request, reply, request.query.code ?? ''))

    scope.post<{ Params: { uid: string }; Body: Form }>('/oauth/interaction/:uid/join', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid) return expired(reply)
      const name = (request.body?.name ?? '').trim()
      const timezone = (request.body?.timezone ?? '').trim()
      const invite = await invitedHousehold(deps.db, interaction.uid)
      if (!invite) return expired(reply)
      if (!name) return html(reply, joinPage(interaction.uid, invite.household_name, invite.inviter_name, 'Enter your name.'), 400)
      try {
        const userId = await joinWithVerifiedEmail(deps.db, interaction.uid, name, timezone)
        if (!userId) return expired(reply)
        return finish(request, reply, { login: { accountId: userId } })
      } catch {
        return html(reply, joinPage(interaction.uid, invite.household_name, invite.inviter_name, 'Enter a time zone such as America/New_York.'), 400)
      }
    })

    scope.post<{ Params: { uid: string } }>('/oauth/interaction/:uid/consent', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid || interaction.prompt.name !== 'consent') return expired(reply)
      const accountId = interaction.session?.accountId
      if (!accountId) return expired(reply)
      const grant = interaction.grantId
        ? (await provider.Grant.find(interaction.grantId))!
        : new provider.Grant({ accountId, clientId: String(interaction.params.client_id) })
      const missing = interaction.prompt.details as { missingOIDCScope?: string[]; missingOIDCClaims?: string[]; missingResourceScopes?: Record<string, string[]> }
      if (missing.missingOIDCScope) grant.addOIDCScope(missing.missingOIDCScope.join(' '))
      if (missing.missingOIDCClaims) grant.addOIDCClaims(missing.missingOIDCClaims)
      for (const [indicator, scopes] of Object.entries(missing.missingResourceScopes ?? {})) grant.addResourceScope(indicator, scopes.join(' '))
      const grantId = await grant.save()
      return finish(request, reply, { consent: interaction.grantId ? {} : { grantId } }, true)
    })

    scope.post<{ Params: { uid: string } }>('/oauth/interaction/:uid/abort', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction) return expired(reply)
      return finish(request, reply, { error: 'access_denied', error_description: 'The member cancelled sign-in.' })
    })
  })
}