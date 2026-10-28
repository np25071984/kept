import Provider, { errors, type Configuration } from 'oidc-provider'
import type { Db } from '../db/db.js'
import { postgresAdapter } from './adapter.js'
import type { OAuthKeys } from './keys.js'
import { errorPage } from './pages.js'

// Kept's OAuth2 authorization server (IMPLEMENTATION.md §6). Assistants register themselves, sign a member in with PKCE,
// and get an opaque access token bound to the MCP address plus a refresh token.

export const SCOPE = 'kept'

export interface OAuth {
  provider: Provider
  issuer: string
  // The MCP address: the resource every access token is issued for.
  resource: string
}

export function createOAuth(db: Db, keys: OAuthKeys, publicUrl: string): OAuth {
  const issuer = publicUrl.replace(/\/$/, '')
  const resource = `${issuer}/mcp`
  const configuration: Configuration = {
    adapter: postgresAdapter(db),
    jwks: keys.jwks as Configuration['jwks'],
    cookies: { keys: keys.cookieKeys },
    scopes: ['openid', 'offline_access', SCOPE],
    claims: { openid: ['sub'] },
    findAccount: async (_ctx, sub) => ({ accountId: sub, claims: async () => ({ sub }) }),
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: true },
      // A client may use the URL of its metadata document as its client ID instead of registering (MCP 2025-11-25).
      clientIdMetadataDocument: { enabled: true, ack: 'draft-02', allowFetch: async (_ctx, clientId) => clientId.startsWith('https://') },
      revocation: { enabled: true },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => resource,
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx, indicator) => {
          if (indicator !== resource) throw new errors.InvalidTarget()
          return { scope: SCOPE, audience: resource, accessTokenTTL: 3600, accessTokenFormat: 'opaque' }
        },
      },
    },
    // Authorization code only, as OAuth 2.1 and MCP clients expect; no implicit or hybrid flows.
    responseTypes: ['code'],
    clientDefaults: { grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
    pkce: { required: () => true },
    // Assistants stay connected: tokens don't end with the browser session, and refreshing doesn't need offline_access.
    issueRefreshToken: async (_ctx, client) => client.grantTypeAllowed('refresh_token'),
    expiresWithSession: async () => false,
    rotateRefreshToken: true,
    ttl: { AccessToken: 3600, AuthorizationCode: 60, Grant: 365 * 86400, IdToken: 3600, Interaction: 3600, RefreshToken: 90 * 86400, Session: 14 * 86400 },
    interactions: { url: (_ctx, interaction) => `/oauth/interaction/${interaction.uid}` },
    routes: {
      authorization: '/oauth/authorize',
      token: '/oauth/token',
      registration: '/oauth/register',
      jwks: '/oauth/jwks',
      revocation: '/oauth/revoke',
      end_session: '/oauth/session/end',
      userinfo: '/oauth/userinfo',
      introspection: '/oauth/introspect',
      pushed_authorization_request: '/oauth/par',
      code_verification: '/oauth/device',
      device_authorization: '/oauth/device/auth',
      backchannel_authentication: '/oauth/backchannel',
      challenge: '/oauth/challenge',
      credential: '/oauth/credential',
    },
    // Browser-based MCP clients call the token and registration endpoints cross-origin.
    clientBasedCORS: () => true,
    renderError: async (ctx, out) => {
      ctx.type = 'html'
      ctx.body = errorPage(String(out.error_description ?? out.error ?? 'Sign-in failed.'))
    },
  }
  const provider = new Provider(issuer, configuration)
  // Behind Caddy, which terminates TLS.
  provider.proxy = true
  // Kept has one scope. A client that asks for none, as MCP allows, gets it; without it there would be nothing to grant.
  provider.use(async (ctx, next) => {
    if (ctx.path === configuration.routes!.authorization && ctx.method === 'GET' && !ctx.query.scope) ctx.query = { ...ctx.query, scope: SCOPE }
    await next()
  })
  return { provider, issuer, resource }
}

// The member an access token was issued for, if it is valid for the MCP address.
export async function verifyAccessToken(oauth: OAuth, token: string): Promise<string | null> {
  const found = await oauth.provider.AccessToken.find(token)
  if (!found || found.isExpired || !found.accountId) return null
  const audiences = Array.isArray(found.aud) ? found.aud : [found.aud]
  if (!audiences.includes(oauth.resource)) return null
  if (!String(found.scope ?? '').split(' ').includes(SCOPE)) return null
  return found.accountId
}