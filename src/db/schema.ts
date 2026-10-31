import type { ColumnType, Generated } from 'kysely'
import type { RepeatTemplate } from '../domain/repeats.js'

// `numeric` comes back as a string and `date` as 'YYYY-MM-DD' (see db.ts).
type Numeric = ColumnType<string, string | number, string | number>
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>
type Json<T> = ColumnType<T, string, string>

export interface Database {
  households: {
    id: Generated<string>
    household_id: ColumnType<string, never, never>
    name: string
    currency: string
    timezone: string
    setup: Json<Record<string, string>>
    created_at: Generated<Date>
  }
  users: {
    id: Generated<string>
    household_id: string
    name: string
    email: string
    role: 'owner' | 'member'
    language: string | null
    introduced_at: Timestamp | null
    created_at: Generated<Date>
  }
  api_keys: {
    id: Generated<string>
    household_id: string
    user_id: string
    key_hash: string
    name: string
    created_at: Generated<Date>
    last_used_at: Timestamp | null
    revoked_at: Timestamp | null
    kept_at: Timestamp | null
  }
  categories: {
    id: Generated<string>
    household_id: string
    path: string
  }
  cost_centers: {
    id: Generated<string>
    household_id: string
    name: string
    kind: string
  }
  invites: {
    id: Generated<string>
    household_id: string
    email: string
    invited_by: string
    token_hash: string
    expires_at: Timestamp
    accepted_at: Timestamp | null
    created_at: Generated<Date>
  }
  repeats: {
    id: Generated<string>
    household_id: string
    user_id: string
    template: Json<RepeatTemplate>
    frequency: 'weekly' | 'monthly' | 'yearly'
    interval: number
    anchor: string
    next_date: string
    ends_on: string | null
    remaining: number | null
    paused: Generated<boolean>
    created_at: Generated<Date>
  }
  transactions: {
    id: Generated<string>
    household_id: string
    spent_by: string
    date: string
    occurred_at: Timestamp | null
    timezone: string
    amount: Numeric
    private: Generated<boolean>
    merchant: string | null
    notes: string | null
    main_category_id: string | null
    repeat_id: string | null
    checked_groups: Generated<string[]>
    user_edited: Generated<string[]>
    created_at: Generated<Date>
    updated_at: Generated<Date>
  }
  line_items: {
    id: Generated<string>
    household_id: string
    transaction_id: string
    position: number
    amount: Numeric
    category_id: string
    item: string | null
    notes: string | null
    is_rest: Generated<boolean>
  }
  line_item_cost_centers: {
    household_id: string
    line_item_id: string
    cost_center_id: string
    share: Numeric | null
  }
  sources: {
    id: Generated<string>
    household_id: string
    transaction_id: string
    user_id: string
    kind: string
    received_at: Generated<Date>
    extracted: Json<Record<string, unknown>> | null
  }
  updates: {
    id: Generated<string>
    household_id: string
    user_id: string
    kind: 'repeat_registered' | 'possible_duplicate' | 'missing_charge'
    text: string
    transaction_id: string | null
    other_transaction_id: string | null
    repeat_id: string | null
    created_at: Generated<Date>
    seen_at: Timestamp | null
    resolved_at: Timestamp | null
  }
  watches: {
    id: Generated<string>
    household_id: string
    user_id: string
    category_id: string | null
    item: string | null
    created_at: Generated<Date>
  }
  caps: {
    id: Generated<string>
    household_id: string
    user_id: string
    category_id: string | null
    cost_center_id: string | null
    amount: Numeric
    period: 'month' | 'year'
    kept_period: string | null
    created_at: Generated<Date>
  }
  notes: {
    id: Generated<string>
    household_id: string
    text: string
    user_id: string
    created_at: Generated<Date>
    updated_at: Generated<Date>
  }
  oauth_models: {
    name: string
    id: string
    payload: Json<Record<string, unknown>>
    grant_id: string | null
    user_code: string | null
    uid: string | null
    expires_at: Timestamp | null
    consumed_at: Timestamp | null
  }
  oauth_keys: {
    id: number
    jwks: Json<{ keys: Record<string, unknown>[] }>
    cookie_keys: string[]
  }
  sign_in_codes: {
    id: Generated<string>
    interaction_uid: string
    email: string
    code_hash: string
    expires_at: Timestamp
    attempts: Generated<number>
    verified_at: Timestamp | null
    created_at: Generated<Date>
  }
  invite_requests: {
    id: Generated<string>
    household_id: string
    created_at: Generated<Date>
  }
  sign_in_requests: {
    id: Generated<string>
    email: string
    ip: string
    created_at: Generated<Date>
  }
}