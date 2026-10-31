import { Type, type TSchema } from 'typebox'

// Request schemas. They validate input and generate the OpenAPI spec (IMPLEMENTATION.md §6). The transaction schemas are
// in Zod (transactionSchemas.ts), shared with the MCP tools.

const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()])
export const LocalDate = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Local date, YYYY-MM-DD.' })
// Limits the MCP tools share, so a tool never accepts what the API refuses.
export const MIN_AMOUNT = 0.01
export const MIN_SHARE = 0.000001
export const MAX_BATCH = 500
export const MAX_PAGE = 500

const Amount = Type.Number({ minimum: MIN_AMOUNT, description: 'In the household currency.' })

export const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) })

export const CategoryBody = Type.Object({ path: Type.String({ minLength: 1 }) })
export const CategoryRename = Type.Object({ path: Type.String({ minLength: 1 }), new_path: Type.String({ minLength: 1, description: 'The new path; its parent must exist. Subcategories move with it.' }) })
export const CategoryQuery = Type.Object({ path: Type.String({ minLength: 1 }) })
export const CostCenterPatch = Type.Object({
  name: Type.String({ minLength: 1, description: 'The cost center to change.' }),
  new_name: Type.Optional(Type.String({ minLength: 1 })),
  kind: Type.Optional(Type.String({ minLength: 1 })),
})
export const CostCenterName = Type.Object({ name: Type.String({ minLength: 1 }) })
export const CostCenterBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  kind: Type.String({ minLength: 1, description: 'Car, Home, Child, Pet or anything else.' }),
})

export const CapBody = Type.Object({
  category: Type.Optional(Nullable(Type.String({ description: 'A category; its subcategories count toward it.' }))),
  cost_center: Type.Optional(Nullable(Type.String({ description: 'One of the people & things.' }))),
  amount: Amount,
  period: Type.Union([Type.Literal('month'), Type.Literal('year')]),
})
export const CapPatch = Type.Object({ amount: Type.Optional(Amount), period: Type.Optional(Type.Union([Type.Literal('month'), Type.Literal('year')])) })

export const QuestionParams = Type.Object({ id: Type.String({ minLength: 3, description: 'A question id from GET /api/v1/questions, e.g. "cap:…".' }) })
export const AnswerBody = Type.Object({ answer: Type.String({ description: 'duplicate: merge or different; cap: remove or keep; missing_charge: stop or still_paying; unused_key: revoke or keep.' }) })
export const MissingBody = Type.Object({ period: Type.String({ minLength: 1, description: 'The statement it was missing from, e.g. "October".' }) })

export const WatchBody = Type.Object({
  category: Type.Optional(Nullable(Type.String({ description: 'A category or subcategory, e.g. "Groceries/Alcohol".' }))),
  item: Type.Optional(Nullable(Type.String({ description: 'An item bought across categories, e.g. "snacks".' }))),
})

export const NoteBody = Type.Object({ text: Type.String({ minLength: 1, description: 'In the user\'s words, with any time as a date: "We\'re selling the Kia in December 2026."' }) })

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
  timezone: Type.Optional(Type.String({ description: 'The household\'s IANA time zone. Owners only.' })),
  steps: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Literal('pending'), Type.Literal('done'), Type.Literal('later')]))),
  introduced: Type.Optional(Type.Literal(true)),
})

export const MePatch = Type.Object({ name: Type.Optional(Type.String({ minLength: 1 })), language: Type.Optional(Nullable(Type.Union([Type.Literal('en'), Type.Literal('ru')]))) })
export const MemberPatch = Type.Object({ role: Type.Union([Type.Literal('owner'), Type.Literal('member')]) })
export const InviteBody = Type.Object({ email: Type.String({ format: 'email' }) })
export const AcceptBody = Type.Object({ token: Type.String({ minLength: 10 }), name: Type.String({ minLength: 1 }) })
export const ApiKeyBody = Type.Object({ name: Type.String({ minLength: 1 }) })

export const SummaryQuery = Type.Object({
  from: Type.Optional(LocalDate),
  to: Type.Optional(LocalDate),
  group_by: Type.Optional(Type.Union([Type.Literal('category'), Type.Literal('cost_center'), Type.Literal('item'), Type.Literal('merchant')])),
  period: Type.Optional(Type.Union([Type.Literal('month'), Type.Literal('year'), Type.Literal('total')])),
  scope: Type.Optional(Type.Union([Type.Literal('me'), Type.Literal('household')])),
})
