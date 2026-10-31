import { z } from 'zod'
import { Amount, flag, Id, LocalDate, localDate, ResponseId, Timestamp } from './common.js'
import { Transaction } from './transactions.js'

const Name = z.string().min(1)

export const CategoryBody = z.object({ path: Name.describe('A category path, e.g. "Groceries/Alcohol". A subcategory\'s parent must exist.') })
export const CategoryRename = z.object({ path: Name, new_path: Name.describe('The new path; its parent must exist. Subcategories move with it.') })
export const CategoryQuery = z.object({ path: Name })

const Kind = Name.describe('Car, Home, Child, Pet or anything else.')
export const CostCenterBody = z.object({ name: Name, kind: Kind })
export const CostCenterPatch = z.object({ name: Name.describe('The cost center to change.'), new_name: Name.optional(), kind: Kind.optional() })
export const CostCenterName = z.object({ name: Name })

export const WatchBody = z.object({
  category: z.string().nullish().describe('A category or subcategory, e.g. "Groceries/Alcohol".'),
  item: z.string().nullish().describe('An item bought across categories, e.g. "snacks".'),
})

export const QuestionParams = z.object({ id: z.string().min(3).describe('A question id from GET /api/v1/questions, e.g. "cap:…".') })
export const AnswerBody = z.object({ answer: z.string().describe('duplicate: merge or different; cap: remove or keep; missing_charge: stop or still_paying; unused_key: revoke or keep. keep silences a cap for its period and a key for a year.') })
export const MissingBody = z.object({ period: Name.describe('The statement it was missing from, e.g. "October".') })

const Period = z.enum(['month', 'year'])
export const CapBody = z.object({
  category: z.string().nullish().describe('A category; its subcategories count toward it.'),
  cost_center: z.string().nullish().describe('One of the people & things.'),
  amount: Amount,
  period: Period,
})
export const CapPatch = z.object({ amount: Amount.optional(), period: Period.optional() })

export const NoteBody = z.object({ text: Name.describe('In the user\'s words, with any time as a date: "We\'re selling the Kia in December 2026."') })

const Schedule = z.object({
  frequency: z.enum(['weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).optional().describe('2 with weekly = every two weeks.'),
  anchor: localDate('Sets the weekday, day of month or date, YYYY-MM-DD. Defaults to the purchase date.').optional(),
  ends_on: LocalDate.nullish(),
  remaining: z.number().int().min(0).nullish().describe('How many more times it repeats.'),
})
export const RepeatBody = Schedule.extend({ transaction_id: Id.describe('The first occurrence; the repeat copies it.') })
export const RepeatPatch = Schedule.partial().extend({ amount: Amount.optional(), paused: z.boolean().optional() })

export const UpdatesQuery = z.object({ all: flag('Include updates already seen.').optional() })
export const SeenBody = z.object({ ids: z.array(Id) })

export const SummaryQuery = z.object({
  from: LocalDate.optional(),
  to: LocalDate.optional(),
  group_by: z.enum(['category', 'cost_center', 'item', 'merchant']).optional(),
  period: z.enum(['month', 'year', 'total']).optional(),
  scope: z.enum(['me', 'household']).optional().describe('"me" (default): the caller\'s own spending, private included. "household": every member\'s non-private spending, never by member.'),
})

export const Category = z.object({ path: z.string() })
export const CostCenter = z.object({ name: z.string(), kind: z.string() })

export const Watch = z.object({
  id: ResponseId,
  category: z.string().nullable(),
  item: z.string().nullable(),
  group: z.string().describe('The category or item, as the agent names it.'),
})

const Asked = { id: z.string(), created_at: Timestamp }
export const Question = z.discriminatedUnion('kind', [
  z.object({ ...Asked, kind: z.literal('connect') }),
  z.object({ ...Asked, kind: z.literal('duplicate'), first: Transaction, later: Transaction }),
  z.object({ ...Asked, kind: z.literal('cap'), cap: z.object({ id: ResponseId, name: z.string(), amount: z.number(), spent: z.number(), period: Period }) }),
  z.object({ ...Asked, kind: z.literal('missing_charge'), text: z.string(), repeat_id: ResponseId }),
  z.object({ ...Asked, kind: z.literal('unused_key'), key: z.object({ id: ResponseId, name: z.string(), last_used_at: Timestamp.nullable() }) }),
])
export const MissingFlagged = z.object({ id: z.string().describe('The open question\'s id.'), text: z.string() })

export const Cap = z.object({
  id: ResponseId,
  category: z.string().nullable(),
  cost_center: z.string().nullable(),
  amount: z.number(),
  period: Period,
  spent: z.number().describe('This month or year, private purchases included.'),
  state: z.enum(['under', 'close', 'over']).describe('close is past 80%.'),
})

export const Note = z.object({ id: ResponseId, text: z.string(), created_at: Timestamp })

export const Repeat = z.object({
  id: ResponseId,
  frequency: Schedule.shape.frequency,
  interval: z.number().int(),
  anchor: z.string(),
  next_date: z.string(),
  ends_on: z.string().nullable(),
  remaining: z.number().int().nullable(),
  paused: z.boolean(),
  amount: z.number(),
  merchant: z.string().nullable(),
  category: z.string().nullable(),
  spent_for: z.array(z.string()),
  last: z.object({ amount: z.number(), date: z.string() }).nullable().describe('The last purchase it logged.'),
})
export const RepeatList = z.object({
  repeats: z.array(Repeat),
  month: z.object({ month: z.string(), total: z.number(), to_come: z.number().describe('Still to be logged this month.') }),
})

export const Update = z.object({
  id: ResponseId,
  kind: z.enum(['repeat_registered', 'possible_duplicate', 'missing_charge']),
  text: z.string(),
  transaction_id: ResponseId.nullable(),
  other_transaction_id: ResponseId.nullable(),
  created_at: Timestamp,
  seen_at: Timestamp.nullable(),
})

export const Summary = z.object({
  from: z.string(),
  to: z.string(),
  scope: SummaryQuery.shape.scope.unwrap(),
  group_by: SummaryQuery.shape.group_by.unwrap(),
  period: SummaryQuery.shape.period.unwrap(),
  currency: z.string(),
  totals: z.array(z.object({ period: z.string().nullable(), key: z.string(), amount: z.number() })),
  watched: z.array(z.object({
    group: z.string(),
    total: z.number(),
    checked_share: z.number().nullable().describe('Share of the spending the group is bought in that was checked for it, 0–1.'),
    estimate: z.number().nullable().describe('The total if unchecked spending is like checked spending.'),
  })),
})
