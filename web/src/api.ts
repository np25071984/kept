import { accessToken } from './auth.js'
import type { ApiKey, Connection, CostCenter, Note, Setup, Transaction, Update, Watch } from './lib/types.js'

// The REST API (IMPLEMENTATION.md §3), with the signed-in member's token.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export class SignedOut extends Error {}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  for (const force of [false, true]) {
    const token = await accessToken(force)
    if (!token) throw new SignedOut()
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
    if (res.status === 401 && !force) continue
    if (res.status === 401) throw new SignedOut()
    if (res.status === 204) return undefined as T
    const data = await res.json()
    if (!res.ok) throw new ApiError(res.status, data.error?.code ?? 'error', data.error?.message ?? 'Something went wrong.')
    return data as T
  }
  throw new SignedOut()
}

export interface TransactionFilters {
  from?: string
  to?: string
  merchant?: string
  category?: string
  cost_center?: string
  item?: string
}

const query = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => !!entry[1])
  return entries.length ? `?${new URLSearchParams(entries)}` : ''
}

export const api = {
  setup: () => call<Setup>('GET', '/api/v1/setup'),
  transactions: (filters: TransactionFilters) => call<{ transactions: Transaction[] }>('GET', `/api/v1/transactions${query({ ...filters, limit: '500' })}`).then((r) => r.transactions),
  transaction: (id: string) => call<Transaction>('GET', `/api/v1/transactions/${id}`),
  updateTransaction: (id: string, patch: unknown) => call<Transaction>('PATCH', `/api/v1/transactions/${id}`, patch),
  deleteTransaction: (id: string) => call<void>('DELETE', `/api/v1/transactions/${id}`),
  merge: (keepId: string, otherId: string) => call<Transaction>('POST', `/api/v1/transactions/${keepId}/merge`, { other_id: otherId }),
  categories: () => call<{ categories: { path: string }[] }>('GET', '/api/v1/categories').then((r) => r.categories.map((c) => c.path)),
  costCenters: () => call<{ cost_centers: CostCenter[] }>('GET', '/api/v1/cost-centers').then((r) => r.cost_centers),
  updates: (all = false) => call<{ updates: Update[] }>('GET', `/api/v1/updates${all ? '?all=true' : ''}`).then((r) => r.updates),
  markSeen: (ids: string[]) => call<{ marked: number }>('POST', '/api/v1/updates/seen', { ids }),

  addCategory: (path: string) => call('POST', '/api/v1/categories', { path }),
  renameCategory: (path: string, newPath: string) => call('PATCH', '/api/v1/categories', { path, new_path: newPath }),
  deleteCategory: (path: string) => call<void>('DELETE', `/api/v1/categories${query({ path })}`),
  addCostCenter: (body: { name: string; kind: string; categories: string[] }) => call<CostCenter>('POST', '/api/v1/cost-centers', body),
  updateCostCenter: (name: string, patch: { new_name?: string; kind?: string; categories?: string[] }) => call<CostCenter>('PATCH', '/api/v1/cost-centers', { name, ...patch }),
  deleteCostCenter: (name: string) => call<void>('DELETE', `/api/v1/cost-centers${query({ name })}`),

  watches: () => call<{ watches: Watch[] }>('GET', '/api/v1/watches').then((r) => r.watches),
  watch: (body: unknown) => call<Watch>('POST', '/api/v1/watches', body),
  stopWatching: (id: string) => call<void>('DELETE', `/api/v1/watches/${id}`),
  notes: () => call<{ notes: Note[] }>('GET', '/api/v1/notes').then((r) => r.notes),
  addNote: (body: unknown) => call<Note>('POST', '/api/v1/notes', body),
  updateNote: (id: string, body: unknown) => call<Note>('PATCH', `/api/v1/notes/${id}`, body),
  deleteNote: (id: string) => call<void>('DELETE', `/api/v1/notes/${id}`),

  apiKeys: () => call<{ api_keys: ApiKey[] }>('GET', '/api/v1/api-keys').then((r) => r.api_keys),
  createApiKey: (name: string) => call<{ id: string; key: string }>('POST', '/api/v1/api-keys', { name }),
  revokeApiKey: (id: string) => call<void>('DELETE', `/api/v1/api-keys/${id}`),
  connections: () => call<{ connections: Connection[] }>('GET', '/api/v1/connections').then((r) => r.connections),
  disconnect: (clientId: string) => call<void>('DELETE', `/api/v1/connections/${encodeURIComponent(clientId)}`),
  createClient: (name: string, redirectUri: string) => call<{ client_id: string; client_secret: string }>('POST', '/api/v1/connections/clients', { name, redirect_uri: redirectUri }),
}
