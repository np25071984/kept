import { z } from 'zod'
import { SOURCE_KINDS } from '../domain/matching.js'
import { Amount, flag, Id, LocalDate, localDate, many, MAX_BATCH, MAX_PAGE, MIN_SHARE } from './common.js'

export const SpentFor = z.object({
  cost_center: z.string().min(1).describe('An existing person or thing (cost center) by name.'),
  share: z.number().min(MIN_SHARE).max(1).nullish().describe('Fraction of the line item. Omit to split the remainder evenly.'),
})

export const LineItem = z.object({
  amount: Amount,
  category: z.string().min(1).describe('An existing category path, e.g. "Car/Fuel".'),
  item: z.string().nullish().describe('Free text to track, e.g. "snacks", "shoes".'),
  notes: z.string().nullish(),
  spent_for: z.array(SpentFor).optional(),
})

const SourceKind = z.enum(SOURCE_KINDS)
const Extracted = z.record(z.string(), z.unknown()).describe('What was read from the source, as read.')

const TransactionFields = z.object({
  date: localDate('Local date of the purchase, YYYY-MM-DD. Defaults to today in the user\'s time zone.').optional(),
  occurred_at: z.string().optional().describe('Exact moment, ISO 8601, when a receipt or statement shows it.'),
  timezone: z.string().optional().describe('IANA zone where it happened, if not the household\'s, e.g. "Asia/Tokyo".'),
  merchant: z.string().nullish(),
  notes: z.string().nullish().describe('E.g. the original amount and rate of a foreign purchase.'),
  private: z.boolean().optional().describe('Left out of household totals.'),
  category: z.string().nullish().describe('Main category: the whole purchase, or the rest beside line_items.'),
  spent_for: z.array(SpentFor).optional().describe('Who or what the main category was for.'),
  line_items: z.array(LineItem).optional().describe('Only the parts priced separately; the rest goes to category.'),
  checked_groups: z.array(z.string()).optional().describe('Watched groups the user answered about, "no" included.'),
})

export const TransactionBody = TransactionFields.extend({
  amount: Amount.describe('Total paid, in the household currency.'),
  source: z.object({ kind: SourceKind.optional(), extracted: Extracted.optional() }).optional().describe('Where this came from. Default "talk".'),
})

export const TransactionBatch = z.object({
  transactions: z.array(TransactionBody).min(1).max(MAX_BATCH).describe('One entry per purchase; a statement batch goes in one call.'),
})

export const TransactionsBody = z.union([TransactionBatch, TransactionBody])

export const TransactionPatch = TransactionFields.extend({
  amount: Amount.optional().describe('Total paid, in the household currency.'),
  occurred_at: z.string().nullish().describe('Exact moment, ISO 8601, when a receipt or statement shows it.'),
})

export const SourceBody = TransactionFields.extend({
  amount: Amount.optional().describe('The total on the source.'),
  kind: SourceKind,
  extracted: Extracted.optional(),
})

export const MergeBody = z.object({ other_id: Id.describe('The transaction merged into this one and then deleted.') })

export const TransactionQuery = z.object({
  from: LocalDate.optional(),
  to: LocalDate.optional(),
  merchant: z.string().optional(),
  item: z.string().optional(),
  q: z.string().optional().describe('Merchant or item, contains.'),
  private: flag('Only private purchases, or only the rest.').optional(),
  category: many('One or more category paths; each includes its subcategories.').optional(),
  category_only: many('Categories without their subcategories.').optional(),
  cost_center: many('One or more people or things.').optional(),
  no_cost_center: flag('Also purchases with a line for nobody in particular.').optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})