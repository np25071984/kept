// Shapes the REST API returns (IMPLEMENTATION.md §3).

export interface SpentFor {
  cost_center: string
  share: number | null
}

export interface Line {
  amount: number
  category: string
  item: string | null
  notes: string | null
  rest: boolean
  spent_for: SpentFor[]
}

export interface Source {
  id: string
  kind: string
  received_at: string
  extracted: Record<string, unknown> | null
}

export interface Transaction {
  id: string
  date: string
  occurred_at: string | null
  timezone: string
  amount: number
  merchant: string | null
  notes: string | null
  private: boolean
  category: string | null
  repeat_id: string | null
  checked_groups: string[]
  line_items: Line[]
  sources: Source[]
}

export interface Update {
  id: string
  kind: 'repeat_registered' | 'possible_duplicate'
  text: string
  transaction_id: string | null
  other_transaction_id: string | null
  created_at: string
  seen_at: string | null
}

export interface Setup {
  household: { name: string; currency: string; currency_locked: boolean; timezone: string; next_step: string | null }
  you: { name: string; email: string; role: 'owner' | 'member' }
}

export interface Recurring {
  id: string
  frequency: 'weekly' | 'monthly' | 'yearly'
  interval: number
  anchor: string
  next_date: string
  ends_on: string | null
  remaining: number | null
  paused: boolean
  amount: number
  merchant: string | null
  category: string | null
  spent_for: string[]
  last: { amount: number; date: string } | null
}

export interface Member {
  id: string
  name: string
  email: string
  role: 'owner' | 'member'
  you: boolean
  joined_at: string
}

export interface Invite {
  id: string
  email: string
  sent_at: string
  expires_at: string
}

export interface CostCenter {
  name: string
  kind: string
}

export interface Watch {
  id: string
  category: string | null
  item: string | null
  group: string
}

export interface Note {
  id: string
  text: string
  created_at: string
}

export interface ApiKey {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
}

export interface Connection {
  client_id: string
  name: string
  web: boolean
  connected_at: string
  last_used_at: string
}
