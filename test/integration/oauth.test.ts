import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../../src/http/app.js'
import { client, newHousehold, startHarness, type Harness } from './helpers.js'

// The flow an assistant runs when a member adds Kept as a connector (IMPLEMENTATION.md §5, §6).

let h: Harness
let app: App
let base: string
let ownerEmail: string
let ownerKey: string
const REDIRECT = 'http://localhost:7777/callback'

beforeAll(async () => {
  h = await startHarness()
  // The issuer must be the address clients reach, so this app is built once the port is known.
  const probe = await h.app.listen({ port: 0, host: '127.0.0.1' })
  await h.app.close()
  const port = new URL(probe).port
  base = `http://127.0.0.1:${port}`
  const webRoot = mkdtempSync(join(tmpdir(), 'kept-web-'))
  writeFileSync(join(webRoot, 'index.html'), '<div id="root"></div>')
  app = await buildApp({ db: h.db, mailer: { sendInvite: async (i) => { h.invites.push(i) }, sendSignInCode: async (c) => { h.codes.push(c) } }, publicUrl: base, webRoot })
  await app.listen({ port: Number(port), host: '127.0.0.1' })
  ownerEmail = `owner-${Date.now()}@example.com`
  ownerKey = (await newHousehold(h, 'The Smiths', ownerEmail)).api_key
})
afterAll(async () => {
  await app.close()
  await h.close()
})

class Browser {
  private cookies = new Map<string, string>()
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '))
    const response = await fetch(new URL(url, base), { ...init, headers, redirect: 'manual' })
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const [name, ...value] = pair!.split('=')
      this.cookies.set(name!.trim(), value.join('='))
    }
    return response
  }
  form(url: string, fields: Record<string, string>) {
    return this.fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
  }
}

async function register() {
  const metadata = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()
  const response = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Test Assistant', redirect_uris: [REDIRECT], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
  })
  expect(response.status).toBe(201)
  return { metadata, clientId: (await response.json()).client_id as string }
}

// Follows redirects inside Kept until it reaches the assistant's callback or a page.
async function follow(browser: Browser, response: Response): Promise<Response> {
  while (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')!
    if (location.startsWith(REDIRECT)) return response
    response = await browser.fetch(location)
  }
  return response
}

async function authorize(email: string, onJoin?: (browser: Browser, uid: string) => Promise<Response>, minimal = false) {
  const { metadata, clientId } = await register()
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const browser = new Browser()
  const params = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256',
    state: 'xyz', ...(!minimal && { scope: 'kept', resource: `${base}/mcp` }),
  })
  let page = await follow(browser, await browser.fetch(`${metadata.authorization_endpoint}?${params}`))
  expect(await page.text()).toContain('Sign in to Kept')
  const uid = new URL(page.url).pathname.split('/')[3]!

  page = await browser.form(`/oauth/interaction/${uid}/email`, { email })
  expect(await page.text()).toContain('Check your email')
  const code = h.codes.at(-1)!
  expect(code.to).toBe(email.toLowerCase())

  page = await browser.form(`/oauth/interaction/${uid}/code`, { code: code.code })
  if (onJoin) page = await onJoin(browser, uid)
  page = await follow(browser, page)
  expect(await page.text()).toContain('Allow Test Assistant?')
  const consentUid = new URL(page.url).pathname.split('/')[3]!

  const done = await follow(browser, await browser.form(`/oauth/interaction/${consentUid}/consent`, {}))
  const callback = new URL(done.headers.get('location')!)
  expect(callback.searchParams.get('state')).toBe('xyz')

  const token = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: callback.searchParams.get('code')!, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, ...(!minimal && { resource: `${base}/mcp` }) }),
  })
  expect(token.status).toBe(200)
  return { ...(await token.json()), clientId, tokenEndpoint: metadata.token_endpoint as string }
}

describe('OAuth2 for MCP clients', () => {
  it('points an unauthenticated MCP request to the protected resource metadata', async () => {
    const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(`Bearer realm="OAuth", resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="kept"`)
    const metadata = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()
    expect(metadata).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base] })
    const server = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()
    expect(server).toMatchObject({
      issuer: base,
      code_challenge_methods_supported: ['S256'],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      client_id_metadata_document_supported: true,
      scopes_supported: ['kept'],
      protected_resources: [`${base}/mcp`],
    })
    expect(server.userinfo_endpoint).toBeUndefined()
    expect(server.grant_types_supported).not.toContain('implicit')
    expect(server.registration_endpoint).toBe(`${base}/oauth/register`)
  })

  it('signs a member in with an emailed code and lets the assistant use Kept as them', async () => {
    const tokens = await authorize(ownerEmail)
    expect(tokens).toMatchObject({ token_type: 'Bearer', access_token: expect.any(String), refresh_token: expect.any(String) })

    const mcp = new Client({ name: 'assistant', version: '1.0.0' })
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }))
    const playbook = await mcp.callTool({ name: 'get_playbook', arguments: {} })
    expect(JSON.parse((playbook.content as { text: string }[])[0]!.text).setup.you.role).toBe('owner')
    await mcp.close()

    // The REST API takes the same token.
    const rest = await fetch(`${base}/api/v1/categories`, { headers: { authorization: `Bearer ${tokens.access_token}` } })
    expect(rest.status).toBe(200)

    const refreshed = await fetch(tokens.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: tokens.clientId }),
    })
    const next = await refreshed.json()
    expect(refreshed.status).toBe(200)
    expect((await fetch(`${base}/api/v1/setup`, { headers: { authorization: `Bearer ${next.access_token}` } })).status).toBe(200)
  })

  it('works for a client that sends neither scope nor resource', async () => {
    const tokens = await authorize(ownerEmail, undefined, true)
    expect((await fetch(`${base}/api/v1/setup`, { headers: { authorization: `Bearer ${tokens.access_token}` } })).status).toBe(200)
  })

  it('rejects a wrong code and sends no code to an unknown email', async () => {
    const { metadata, clientId } = await register()
    const browser = new Browser()
    const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', scope: 'kept' })
    const page = await follow(browser, await browser.fetch(`${metadata.authorization_endpoint}?${params}`))
    const uid = new URL(page.url).pathname.split('/')[3]!
    const sent = h.codes.length
    const unknown = await browser.form(`/oauth/interaction/${uid}/email`, { email: 'nobody@example.com' })
    expect(await unknown.text()).toContain('Check your email')
    expect(h.codes.length).toBe(sent)
    const wrong = await browser.form(`/oauth/interaction/${uid}/code`, { code: '000000' })
    expect(wrong.status).toBe(400)
  })

  it('refuses a token that is not Kept\'s', async () => {
    expect((await fetch(`${base}/api/v1/setup`, { headers: { authorization: 'Bearer not-a-token' } })).status).toBe(401)
  })

  it('lets an invited person join the household by signing in', async () => {
    const owner = client(h, ownerKey)
    await app.inject({ method: 'POST', url: '/api/v1/invites', headers: { authorization: `Bearer ${ownerKey}` }, payload: { email: 'jo@example.com' } })
    expect(owner).toBeDefined()

    const tokens = await authorize('Jo@example.com', async (browser, uid) => {
      return browser.form(`/oauth/interaction/${uid}/join`, { name: 'Jo' })
    })
    const setup = await (await fetch(`${base}/api/v1/setup`, { headers: { authorization: `Bearer ${tokens.access_token}` } })).json()
    expect(setup).toMatchObject({ household: { name: 'The Smiths' }, you: { role: 'member', introduced: false } })
  })

  it('lists the member\'s connected assistants and disconnects one', async () => {
    const tokens = await authorize(ownerEmail)
    const auth = { authorization: `Bearer ${ownerKey}` }
    const listed = await (await fetch(`${base}/api/v1/connections`, { headers: auth })).json()
    expect(listed.connections).toContainEqual(expect.objectContaining({ client_id: tokens.clientId, name: 'Test Assistant', web: false }))

    expect((await fetch(`${base}/api/v1/connections/${tokens.clientId}`, { method: 'DELETE', headers: auth })).status).toBe(204)
    expect((await fetch(`${base}/api/v1/setup`, { headers: { authorization: `Bearer ${tokens.access_token}` } })).status).toBe(401)
    const refresh = await fetch(tokens.tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: tokens.clientId }) })
    expect(refresh.status).toBe(400)
    expect((await fetch(`${base}/api/v1/connections/${tokens.clientId}`, { method: 'DELETE', headers: auth })).status).toBe(404)
  })

  it('creates a client ID and secret for an assistant that asks for them', async () => {
    const auth = { authorization: `Bearer ${ownerKey}`, 'content-type': 'application/json' }
    const redirect = 'https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-1-example'
    expect((await fetch(`${base}/api/v1/connections/clients`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Gemini', redirect_uri: 'http://x' }) })).status).toBe(422)
    const created = await (await fetch(`${base}/api/v1/connections/clients`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Gemini', redirect_uri: redirect }) })).json()
    expect(created).toMatchObject({ client_id: expect.stringMatching(/^gemini-[0-9a-f]{12}$/), client_secret: expect.any(String) })

    const authorizeWith = (redirectUri: string) =>
      fetch(`${base}/oauth/authorize?${new URLSearchParams({ client_id: created.client_id, response_type: 'code', redirect_uri: redirectUri, scope: 'kept', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' })}`, { redirect: 'manual' })
    expect((await authorizeWith(redirect)).headers.get('location')).toContain('/oauth/interaction/')
    expect((await authorizeWith('https://elsewhere.example/cb')).status).toBe(400)
  })

  it('signs a member in to the web UI without a consent page, and serves the app', async () => {
    const callbackUrl = `${base}/app/callback`
    const verifier = randomBytes(32).toString('base64url')
    const browser = new Browser()
    const params = new URLSearchParams({
      response_type: 'code', client_id: 'kept-web', redirect_uri: callbackUrl, scope: 'kept', state: 'web', prompt: 'login',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    })
    let page = await browser.fetch(`/oauth/authorize?${params}`)
    while (page.status >= 300 && page.status < 400) page = await browser.fetch(page.headers.get('location')!)
    const email = await page.text()
    expect(email).toContain('Review and fix what your assistant logged')
    expect(email).not.toContain('Cancel')
    const uid = new URL(page.url).pathname.split('/')[3]!
    await browser.form(`/oauth/interaction/${uid}/email`, { email: ownerEmail })
    page = await browser.form(`/oauth/interaction/${uid}/code`, { code: h.codes.at(-1)!.code })
    while (page.status >= 300 && page.status < 400 && !page.headers.get('location')!.startsWith(callbackUrl)) page = await browser.fetch(page.headers.get('location')!)
    const callback = new URL(page.headers.get('location')!)
    expect(callback.searchParams.get('state')).toBe('web')

    const token = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: callback.searchParams.get('code')!, redirect_uri: callbackUrl, client_id: 'kept-web', code_verifier: verifier }),
    })
    const tokens = await token.json()
    expect(tokens.refresh_token).toEqual(expect.any(String))
    const setup = await (await fetch(`${base}/api/v1/setup`, { headers: { authorization: `Bearer ${tokens.access_token}` } })).json()
    expect(setup.you).toMatchObject({ email: ownerEmail, name: 'Sam', role: 'owner' })

    // Any path the app routes itself gets the page, with a policy that allows only the app's own files.
    const app = await fetch(`${base}/app/purchases/123`)
    expect(app.headers.get('content-security-policy')).toContain("script-src 'self'")
    expect(await app.text()).toContain('<div id="root">')
  })
})
