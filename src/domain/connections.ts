// The assistants a member has connected, from their OAuth grants (IMPLEMENTATION.md §5.4). Reconnecting an assistant
// makes a new grant, so grants are grouped by client.

export interface GrantRow {
  client_id: string
  issued_at: number
  last_used_at: number | null
}

export interface Connection {
  client_id: string
  connected_at: number
  last_used_at: number
}

export function groupConnections(grants: GrantRow[]): Connection[] {
  const byClient = new Map<string, Connection>()
  for (const grant of grants) {
    const used = Math.max(grant.issued_at, grant.last_used_at ?? 0)
    const seen = byClient.get(grant.client_id)
    byClient.set(grant.client_id, {
      client_id: grant.client_id,
      connected_at: Math.min(seen?.connected_at ?? Infinity, grant.issued_at),
      last_used_at: Math.max(seen?.last_used_at ?? 0, used),
    })
  }
  return [...byClient.values()].sort((a, b) => b.last_used_at - a.last_used_at)
}

// A redirect URI an assistant gave for a client created ahead of time: https, no fragment.
export function checkRedirectUri(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return 'Paste the full redirect URI, starting with https://.'
  }
  if (url.protocol !== 'https:') return 'The redirect URI must start with https://.'
  if (url.hash) return 'A redirect URI has no # part.'
  return null
}
