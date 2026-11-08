import { z } from 'zod'
import { Timestamp } from './common.js'
import { Cap, Note, Repeat, Watch } from './ledger.js'
import { Transaction } from './transactions.js'

const ExportedRepeat = Repeat.omit({ last: true }).extend({
  notes: z.string().nullable(),
  private: z.boolean(),
  line_items: z.array(z.object({
    amount: z.number(),
    category: z.string(),
    item: z.string().nullish(),
    notes: z.string().nullish(),
    spent_for: z.array(z.object({ cost_center: z.string(), share: z.number().nullish() })).optional(),
    is_rest: z.boolean().optional(),
  })),
})

// What belongs to the caller. Categories and cost centers appear by name on the records using them; nothing else about the household or its other members is included.
const CreatedVia = z.string().nullable().describe('The client ID of the assistant that wrote it: "kept-web" for the web UI, null for an API key or a repeat.')

export const Export = z.object({
  exported_at: Timestamp,
  member: z.object({ name: z.string(), email: z.string() }),
  currency: z.string().describe('Of every amount in this file.'),
  purchases: z.array(Transaction.extend({ created_via: CreatedVia })).describe('Newest first, private ones included.'),
  notes: z.array(Note.extend({ created_via: CreatedVia })),
  watches: z.array(Watch),
  caps: z.array(Cap.omit({ spent: true, state: true })),
  repeats: z.array(ExportedRepeat),
})
