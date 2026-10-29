import { challengeFor, randomString } from './lib/pkce.js'

// The web UI signs in as Kept's built-in OAuth client with PKCE, through the same email-code pages assistants use
// (IMPLEMENTATION.md §5.4). The refresh token stays in localStorage; access tokens live in memory.

const CLIENT_ID = 'kept-web'
const REFRESH_KEY = 'kept.refresh_token'
const PENDING_KEY = 'kept.sign_in'

interface Metadata {
  authorization_endpoint: string
  token_endpoint: string
  revocation_endpoint: string
}

let metadata: Promise<Metadata> | null = null
let access: { token: string; expires: number } | null = null

function loadMetadata(): Promise<Metadata> {
  metadata ??= fetch('/.well-known/oauth-authorization-server').then((res) => res.json() as Promise<Metadata>)
  return metadata
}

// Token requests go to this origin's path, so Vite's proxy carries them during development.
const path = (url: string) => new URL(url).pathname
const redirectUri = () => `${location.origin}/app/callback`

function storedRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

function store(tokens: { access_token: string; refresh_token?: string; expires_in: number }) {
  access = { token: tokens.access_token, expires: Date.now() + tokens.expires_in * 1000 }
  try {
    if (tokens.refresh_token) localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
  } catch {
    // Without storage the session lasts until the tab closes.
  }
}

function forget() {
  access = null
  try {
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    // Nothing stored.
  }
}

async function tokenRequest(params: Record<string, string>) {
  const { token_endpoint } = await loadMetadata()
  const res = await fetch(path(token_endpoint), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT_ID, ...params }) })
  return res.ok ? ((await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }) : null
}

export function hasSession(): boolean {
  return access != null || storedRefresh() != null
}

export async function signIn(returnTo: string): Promise<void> {
  const { authorization_endpoint } = await loadMetadata()
  const verifier = randomString()
  const state = randomString(16)
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, returnTo }))
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: 'kept',
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
    // Always ask for the emailed code, so signing out here also ends the sign-in on a shared computer.
    prompt: 'login',
  })
  // Replace, so Back from the email page leaves the app instead of landing here and redirecting again.
  location.replace(`${authorization_endpoint}?${params}`)
}

// Finishes sign-in on /app/callback and returns where to go next.
export async function completeSignIn(search: string): Promise<string> {
  const params = new URLSearchParams(search)
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as { verifier: string; state: string; returnTo: string } | null
  sessionStorage.removeItem(PENDING_KEY)
  if (params.get('error')) throw new Error(params.get('error_description') ?? 'Sign-in was cancelled.')
  if (!pending || params.get('state') !== pending.state || !params.get('code')) throw new Error('This sign-in link is stale. Sign in again.')
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code: params.get('code')!, redirect_uri: redirectUri(), code_verifier: pending.verifier })
  if (!tokens) throw new Error('Kept didn\'t accept the sign-in. Try again.')
  store(tokens)
  return pending.returnTo
}

async function refresh(): Promise<string | null> {
  const run = async () => {
    // Another tab may have rotated the refresh token while this one waited for the lock.
    const token = storedRefresh()
    if (!token) return null
    const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: token })
    if (!tokens) {
      if (storedRefresh() === token) forget()
      return null
    }
    store(tokens)
    return tokens.access_token
  }
  return navigator.locks ? navigator.locks.request('kept-refresh', run) : run()
}

// A valid access token, refreshed when it is about to expire, or null when signed out.
export async function accessToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && access && access.expires - Date.now() > 30_000) return access.token
  return refresh()
}

export async function signOut(): Promise<void> {
  const token = storedRefresh()
  forget()
  if (!token) return
  const { revocation_endpoint } = await loadMetadata()
  await fetch(path(revocation_endpoint), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT_ID, token, token_type_hint: 'refresh_token' }) }).catch(() => undefined)
}
