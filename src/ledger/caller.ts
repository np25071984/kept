// The authenticated household member every request runs as (IMPLEMENTATION.md §4).
export interface Caller {
  user_id: string
  household_id: string
  role: 'owner' | 'member'
  name: string
  timezone: string
  currency: string
}