// How many requests one IP address may make to each group of endpoints, so a flood is refused before it reaches the
// database (IMPLEMENTATION.md §4). Assistants call the token, registration and MCP endpoints from their makers' servers,
// where many households share a few addresses, so those limits are wide; the sign-in pages open in one person's browser.
export interface Limit {
  bucket: string
  max: number
  windowMs: number
}

const MINUTE = 60_000

export function limitFor(method: string, url: string): Limit | null {
  const path = url.split('?')[0]!
  if (path === '/oauth/register' && method === 'POST') return { bucket: 'register', max: 300, windowMs: 60 * MINUTE }
  if (path === '/oauth/token' || path === '/oauth/revoke') return { bucket: 'token', max: 600, windowMs: MINUTE }
  if (path === '/oauth/authorize') return { bucket: 'authorize', max: 30, windowMs: MINUTE }
  if (path.startsWith('/oauth/interaction/')) return { bucket: 'signin', max: 60, windowMs: MINUTE }
  if (path === '/mcp' || path.startsWith('/api/')) return { bucket: 'api', max: 3000, windowMs: MINUTE }
  return null
}

// A fixed window: the count of requests since `start`.
export interface Window {
  start: number
  count: number
}

// Counts one request against an address's window for a limit, starting a new window once the old one has passed.
export function countRequest(previous: Window | undefined, limit: Limit, now: number): { window: Window; allowed: boolean; retryAfterMs: number } {
  const window = previous && now - previous.start < limit.windowMs ? { start: previous.start, count: previous.count + 1 } : { start: now, count: 1 }
  const allowed = window.count <= limit.max
  return { window, allowed, retryAfterMs: allowed ? 0 : window.start + limit.windowMs - now }
}

export function windowOver(window: Window, limit: Limit, now: number): boolean {
  return now - window.start >= limit.windowMs
}
