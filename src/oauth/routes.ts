import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Db } from '../db/db.js'
import type { App } from '../http/app.js'
import type { Mailer } from '../ledger/households.js'
import { codePage, consentPage, createPage, emailPage, errorPage, joinPage } from './pages.js'
import { languageRoutes, requestLanguage } from './language.js'
import { SCOPE, WEB_CLIENT_ID, type OAuth } from './provider.js'
import { createWithVerifiedEmail, invitedHousehold, joinWithVerifiedEmail, sendCode, verifiedNewEmail, verifyCode } from './signin.js'

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
    const langOf = (request: FastifyRequest) => requestLanguage(request.headers.cookie, request.headers['accept-language'])
    languageRoutes(scope)
    const html = (reply: FastifyReply, body: string, status = 200) => reply.status(status).type('text/html; charset=utf-8').header('cache-control', 'no-store').send(body)
    const details = async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await provider.interactionDetails(request.raw, reply.raw)
      } catch {
        return null
      }
    }
    const clientName = async (clientId: unknown) => (await provider.Client.find(String(clientId)))?.clientName ?? 'Your assistant'
    const emailClient = async (clientId: unknown) => (clientId === WEB_CLIENT_ID ? null : clientName(clientId))
    const finish = async (request: FastifyRequest, reply: FastifyReply, result: Parameters<typeof provider.interactionResult>[2], merge = false) => {
      const location = await provider.interactionResult(request.raw, reply.raw, result, { mergeWithLastSubmission: merge })
      return reply.status(303).header('location', location).send()
    }
    const expired = (reply: FastifyReply) => html(reply, errorPage(langOf(reply.request), 'This sign-in has expired.'), 400)

    type Interaction = Awaited<ReturnType<typeof provider.interactionDetails>>
    const consent = async (request: FastifyRequest, reply: FastifyReply, interaction: Interaction) => {
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
    }

    scope.get<{ Params: { uid: string } }>('/oauth/interaction/:uid', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid) return expired(reply)
      if (interaction.prompt.name === 'login') return html(reply, emailPage(langOf(request), interaction.uid, await emailClient(interaction.params.client_id)))
      // Kept's own web UI needs no permission to act as the member who just signed in.
      if (interaction.params.client_id === WEB_CLIENT_ID) return consent(request, reply, interaction)
      return html(reply, consentPage(langOf(request), interaction.uid, await clientName(interaction.params.client_id)))
    })

    scope.post<{ Params: { uid: string }; Body: Form }>('/oauth/interaction/:uid/email', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid) return expired(reply)
      const email = (request.body?.email ?? '').trim()
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) return html(reply, emailPage(langOf(request), interaction.uid, await emailClient(interaction.params.client_id), 'Enter a valid email.'), 400)
      const link = (code: string) => `${deps.oauth.issuer}/oauth/interaction/${interaction.uid}/code?code=${code}`
      try {
        await sendCode(deps.db, deps.mailer, interaction.uid, email, link, langOf(request))
      } catch (error) {
        request.log.error(error, 'sign-in code not sent')
        return html(reply, emailPage(langOf(request), interaction.uid, await emailClient(interaction.params.client_id), 'We couldn\'t send the code just now. Try again in a minute.'), 503)
      }
      return html(reply, codePage(langOf(request), interaction.uid, email))
    })

    const verify = async (request: FastifyRequest<{ Params: { uid: string } }>, reply: FastifyReply, code: string) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid) return expired(reply)
      const verified = await verifyCode(deps.db, interaction.uid, code)
      if (verified.kind === 'user') return finish(request, reply, { login: { accountId: verified.user_id } })
      if (verified.kind === 'invite') return html(reply, joinPage(langOf(request), interaction.uid, verified.invite.household_name, verified.invite.inviter_name))
      if (verified.kind === 'new') return html(reply, createPage(langOf(request), interaction.uid, verified.email))
      return html(reply, codePage(langOf(request), interaction.uid, 'your email', 'That code is wrong or expired. Check it, or send a new one.'), 400)
    }
    scope.post<{ Params: { uid: string }; Body: Form }>('/oauth/interaction/:uid/code', options, async (request, reply) => verify(request, reply, request.body?.code ?? ''))
    // The emailed link: works when opened in the browser that started sign-in.
    scope.get<{ Params: { uid: string }; Querystring: Form }>('/oauth/interaction/:uid/code', options, async (request, reply) => verify(request, reply, request.query.code ?? ''))

    scope.post<{ Params: { uid: string }; Body: Form }>('/oauth/interaction/:uid/join', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid) return expired(reply)
      const name = (request.body?.name ?? '').trim()
      const invite = await invitedHousehold(deps.db, interaction.uid)
      if (!invite) return expired(reply)
      if (!name) return html(reply, joinPage(langOf(request), interaction.uid, invite.household_name, invite.inviter_name, 'Enter your name.'), 400)
      const userId = await joinWithVerifiedEmail(deps.db, interaction.uid, name)
      if (!userId) return expired(reply)
      return finish(request, reply, { login: { accountId: userId } })
    })

    scope.post<{ Params: { uid: string }; Body: Form }>('/oauth/interaction/:uid/create', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid) return expired(reply)
      const email = await verifiedNewEmail(deps.db, interaction.uid)
      if (!email) return expired(reply)
      const input = { name: (request.body?.household ?? '').trim(), owner_name: (request.body?.name ?? '').trim(), currency: request.body?.currency ?? '', timezone: request.body?.timezone ?? '' }
      if (!input.name || !input.owner_name) return html(reply, createPage(langOf(request), interaction.uid, email, 'Enter the household\'s name and yours.'), 400)
      try {
        const userId = await createWithVerifiedEmail(deps.db, interaction.uid, { ...input, language: langOf(request) })
        if (!userId) return expired(reply)
        return finish(request, reply, { login: { accountId: userId } })
      } catch (error) {
        request.log.warn(error, 'household not created')
        return html(reply, createPage(langOf(request), interaction.uid, email, 'Check the currency and time zone, then try again.'), 400)
      }
    })

    scope.post<{ Params: { uid: string } }>('/oauth/interaction/:uid/consent', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction || interaction.uid !== request.params.uid || interaction.prompt.name !== 'consent') return expired(reply)
      return consent(request, reply, interaction)
    })

    scope.post<{ Params: { uid: string } }>('/oauth/interaction/:uid/abort', options, async (request, reply) => {
      const interaction = await details(request, reply)
      if (!interaction) return expired(reply)
      return finish(request, reply, { error: 'access_denied', error_description: 'The member cancelled sign-in.' })
    })
  })
}