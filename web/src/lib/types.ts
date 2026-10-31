import type { z } from 'zod'
import type * as connections from '../../../src/api/connections.js'
import type * as household from '../../../src/api/household.js'
import type * as ledger from '../../../src/api/ledger.js'
import type * as transactions from '../../../src/api/transactions.js'

// Shapes the REST API returns, as they arrive (IMPLEMENTATION.md §3).

export type Transaction = z.input<typeof transactions.Transaction>
export type Line = Transaction['line_items'][number]
export type SpentFor = Line['spent_for'][number]
export type Source = Transaction['sources'][number]
export type Update = z.input<typeof ledger.Update>
export type Setup = z.input<typeof household.Setup>
export type Recurring = z.input<typeof ledger.Repeat>
export type Question = z.input<typeof ledger.Question>
export type Cap = z.input<typeof ledger.Cap>
export type Member = z.input<typeof household.Members>['members'][number]
export type Invite = z.input<typeof household.Members>['invites'][number]
export type CostCenter = z.input<typeof ledger.CostCenter>
export type Watch = z.input<typeof ledger.Watch>
export type Note = z.input<typeof ledger.Note>
export type ApiKey = z.input<typeof household.ApiKey>
export type Connection = z.input<typeof connections.Connection>