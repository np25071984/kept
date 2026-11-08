// The authenticated household member every request runs as (IMPLEMENTATION.md §4).
export interface Caller {
  user_id: string
  household_id: string
  role: 'owner' | 'member'
  name: string
  timezone: string
  currency: string
  // The OAuth client the request came through; null for an API key or the scheduler. Recorded on what it writes.
  client_id: string | null
}