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
  household: { name: string; currency: string; next_step: string | null }
  you: { name: string; email: string; role: 'owner' | 'member'; timezone: string }
}

export interface CostCenter {
  name: string
  kind: string
  categories: string[]
}
