import { Type, type Static, type TSchema } from 'typebox'
import { SOURCE_KINDS } from '../domain/matching.js'

// Request schemas. They validate input and generate the OpenAPI spec (IMPLEMENTATION.md §6).

const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()])
export const LocalDate = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Local date, YYYY-MM-DD.' })
const Amount = Type.Number({ exclusiveMinimum: 0, description: 'In the household currency.' })

export const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) })

export const SpentFor = Type.Object({
  cost_center: Type.String({ minLength: 1 }),
  share: Type.Optional(Nullable(Type.Number({ exclusiveMinimum: 0, maximum: 1, description: 'Fraction of the line item. Entries without one split the remainder evenly.' }))),
})

export const LineItem = Type.Object({
  amount: Amount,
  category: Type.String({ minLength: 1, description: 'Category path, e.g. "Car/Fuel".' }),
  item: Type.Optional(Nullable(Type.String())),
  notes: Type.Optional(Nullable(Type.String())),
  spent_for: Type.Optional(Type.Array(SpentFor)),
})

const SourceKind = Type.Union(SOURCE_KINDS.map((kind) => Type.Literal(kind)))

const TransactionFields = {
  date: Type.Optional(LocalDate),
  occurred_at: Type.Optional(Type.String({ description: 'Exact moment, ISO 8601.' })),
  timezone: Type.Optional(Type.String({ description: 'IANA name. Defaults to the caller\'s time zone.' })),
  merchant: Type.Optional(Nullable(Type.String())),
  notes: Type.Optional(Nullable(Type.String())),
  private: Type.Optional(Type.Boolean()),
  category: Type.Optional(Nullable(Type.String({ description: 'Main category: the single line, or the rest line beside explicit line items.' }))),
  spent_for: Type.Optional(Type.Array(SpentFor)),
  line_items: Type.Optional(Type.Array(LineItem)),
  checked_groups: Type.Optional(Type.Array(Type.String(), { description: 'Watched groups the user answered about, "no" included.' })),
}

export const TransactionBody = Type.Object({
  ...TransactionFields,
  amount: Amount,
  source: Type.Optional(Type.Object({ kind: Type.Optional(SourceKind), extracted: Type.Optional(Type.Record(Type.String(), Type.Unknown())) })),
})

export const TransactionsBody = Type.Union([TransactionBody, Type.Object({ transactions: Type.Array(TransactionBody, { minItems: 1, maxItems: 500 }) })])

export const TransactionPatch = Type.Object({ ...TransactionFields, amount: Type.Optional(Amount), occurred_at: Type.Optional(Nullable(Type.String())) })

export const SourceBody = Type.Object({
  ...TransactionFields,
  amount: Type.Optional(Amount),
  kind: SourceKind,
  extracted: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
})

export const MergeBody = Type.Object({ other_id: Type.String({ format: 'uuid', description: 'The transaction merged into this one and then deleted.' }) })

export const TransactionQuery = Type.Object({
  from: Type.Optional(LocalDate),
  to: Type.Optional(LocalDate),
  merchant: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  cost_center: Type.Optional(Type.String()),
  item: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
})

export const CategoryBody = Type.Object({ path: Type.String({ minLength: 1 }) })
export const CategoryRename = Type.Object({ path: Type.String({ minLength: 1 }), new_path: Type.String({ minLength: 1, description: 'The new path; its parent must exist. Subcategories move with it.' }) })
export const CategoryQuery = Type.Object({ path: Type.String({ minLength: 1 }) })
export const CostCenterQuery = Type.Object({ category: Type.Optional(Type.String()) })
export const CostCenterPatch = Type.Object({
  name: Type.String({ minLength: 1, description: 'The cost center to change.' }),
  new_name: Type.Optional(Type.String({ minLength: 1 })),
  kind: Type.Optional(Type.String({ minLength: 1 })),
  categories: Type.Optional(Type.Array(Type.String(), { description: 'Replaces the categories it is linked to.' })),
})
export const CostCenterName = Type.Object({ name: Type.String({ minLength: 1 }) })
export const CostCenterBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  kind: Type.String({ minLength: 1, description: 'Car, Home, Child, Pet or anything else.' }),
  categories: Type.Optional(Type.Array(Type.String())),
})

export const RuleQuery = Type.Object({ merchant: Type.Optional(Type.String()), category: Type.Optional(Type.String()), account_ref: Type.Optional(Type.String()) })
export const RuleBody = Type.Object({
  kind: Type.Union(['watch', 'ask_breakdown', 'set_category', 'set_spent_for', 'set_private'].map((k) => Type.Literal(k))),
  merchant: Type.Optional(Nullable(Type.String())),
  category: Type.Optional(Nullable(Type.String())),
  account_ref: Type.Optional(Nullable(Type.String())),
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  text: Type.String({ minLength: 1, description: 'The rule in the user\'s words.' }),
  personal: Type.Optional(Type.Boolean()),
})

export const NoteQuery = Type.Object({
  cost_center: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  merchant: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
  include_expired: Type.Optional(Type.Boolean()),
})
const NoteFields = {
  personal: Type.Optional(Type.Boolean()),
  cost_centers: Type.Optional(Type.Array(Type.String())),
  categories: Type.Optional(Type.Array(Type.String())),
  merchants: Type.Optional(Type.Array(Type.String())),
  expires_on: Type.Optional(Nullable(LocalDate)),
}
export const NoteBody = Type.Object({ ...NoteFields, text: Type.String({ minLength: 1 }) })
export const NotePatch = Type.Object({ ...NoteFields, text: Type.Optional(Type.String({ minLength: 1 })) })

const Frequency = Type.Union([Type.Literal('weekly'), Type.Literal('monthly'), Type.Literal('yearly')])
export const RepeatBody = Type.Object({
  transaction_id: Type.String({ format: 'uuid', description: 'The first occurrence; the repeat copies it.' }),
  frequency: Frequency,
  interval: Type.Optional(Type.Integer({ minimum: 1 })),
  anchor: Type.Optional(LocalDate),
  ends_on: Type.Optional(Nullable(LocalDate)),
  remaining: Type.Optional(Nullable(Type.Integer({ minimum: 0 }))),
})
export const RepeatPatch = Type.Object({
  amount: Type.Optional(Amount),
  frequency: Type.Optional(Frequency),
  interval: Type.Optional(Type.Integer({ minimum: 1 })),
  anchor: Type.Optional(LocalDate),
  ends_on: Type.Optional(Nullable(LocalDate)),
  remaining: Type.Optional(Nullable(Type.Integer({ minimum: 0 }))),
  paused: Type.Optional(Type.Boolean()),
})

export const UpdatesQuery = Type.Object({ all: Type.Optional(Type.Boolean({ description: 'Include updates already seen.' })) })
export const SeenBody = Type.Object({ ids: Type.Array(Type.String({ format: 'uuid' })) })

export const SetupPatch = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  timezone: Type.Optional(Type.String()),
  steps: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Literal('pending'), Type.Literal('done'), Type.Literal('later')]))),
  introduced: Type.Optional(Type.Literal(true)),
})

export const InviteBody = Type.Object({ email: Type.String({ format: 'email' }) })
export const AcceptBody = Type.Object({ token: Type.String({ minLength: 10 }), name: Type.String({ minLength: 1 }), timezone: Type.String() })
export const ApiKeyBody = Type.Object({ name: Type.String({ minLength: 1 }) })

export const SummaryQuery = Type.Object({
  from: Type.Optional(LocalDate),
  to: Type.Optional(LocalDate),
  group_by: Type.Optional(Type.Union([Type.Literal('category'), Type.Literal('cost_center'), Type.Literal('item')])),
  period: Type.Optional(Type.Union([Type.Literal('month'), Type.Literal('year'), Type.Literal('total')])),
  scope: Type.Optional(Type.Union([Type.Literal('me'), Type.Literal('household')])),
})

export type TransactionBodyT = Static<typeof TransactionBody>