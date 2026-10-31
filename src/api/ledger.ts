import { z } from 'zod'
import { Amount, flag, Id, LocalDate, localDate } from './common.js'

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
export const AnswerBody = z.object({ answer: z.string().describe('duplicate: merge or different; cap: remove or keep; missing_charge: stop or still_paying; unused_key: revoke or keep.') })
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