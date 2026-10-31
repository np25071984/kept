import { daysBetween, type LocalDate } from './dates.js'
import { buildLines, resizeLines, type Line } from './lines.js'
import { relateMerchants } from './merchants.js'
import type { Cents } from './money.js'

// Matching keeps one transaction per purchase however many sources report it (VISION.md §3.4).

export const SOURCE_KINDS = ['talk', 'photo', 'document', 'email', 'statement', 'other'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export interface MatchCandidate {
  id: string
  date: LocalDate
  amount: Cents
  merchant: string | null
  repeated: boolean
  sources: { kind: SourceKind; amount: Cents | null }[]
}

export interface IncomingCharge {
  kind: SourceKind
  date: LocalDate
  amount: Cents
  merchant: string | null
}

export type MatchDecision =
  | { kind: 'attach'; id: string }
  | { kind: 'possible_duplicate'; id: string }
  | { kind: 'create' }

export const MATCH_WINDOW_DAYS = 4
const REPEAT_WINDOW_DAYS = 7
// How far either side of a date to load candidates: the widest window any candidate can match in.
export const CANDIDATE_WINDOW_DAYS = Math.max(MATCH_WINDOW_DAYS, REPEAT_WINDOW_DAYS)

type Strength = 'clear' | 'unclear' | null

export function classifyMatch(candidate: MatchCandidate, incoming: IncomingCharge): Strength {
  // Two reports of the same kind are two purchases: two statement lines are two charges.
  if (candidate.sources.some((source) => source.kind === incoming.kind)) return null
  const merchants = relateMerchants(candidate.merchant, incoming.merchant)
  if (merchants === 'different') return null
  const window = candidate.repeated ? REPEAT_WINDOW_DAYS : MATCH_WINDOW_DAYS
  const days = Math.abs(daysBetween(candidate.date, incoming.date))
  if (days > window) return null

  // A user's edit changes the current amount; the original source amounts still identify the purchase.
  const amounts = [candidate.amount, ...candidate.sources.flatMap((source) => (source.amount == null ? [] : [source.amount]))]
  const diff = Math.min(...amounts.map((amount) => Math.abs(amount - incoming.amount)))
  const base = Math.max(candidate.amount, incoming.amount)

  if (diff === 0) return merchants === 'same' || days <= 1 ? 'clear' : 'unclear'
  // Tips, holds and currency conversion move the amount a little.
  if (diff <= Math.max(150, base * 0.03)) return merchants === 'same' ? 'clear' : 'unclear'
  // A repeat carries last period's amount; the real bill wins (VISION.md §3.5).
  if (candidate.repeated && merchants === 'same' && diff <= base * 0.5) return 'clear'
  // A restaurant tip can be a quarter of the bill.
  if (merchants === 'same' && diff <= base * 0.25) return 'unclear'
  return null
}

export function decideMatch(candidates: MatchCandidate[], incoming: IncomingCharge): MatchDecision {
  const ranked = candidates
    .map((candidate) => ({ candidate, strength: classifyMatch(candidate, incoming) }))
    .filter((entry) => entry.strength != null)
    .sort((a, b) => closeness(a.candidate, incoming) - closeness(b.candidate, incoming))
  const clear = ranked.filter((entry) => entry.strength === 'clear')
  if (clear.length === 1) return { kind: 'attach', id: clear[0]!.candidate.id }
  const best = ranked[0]
  return best ? { kind: 'possible_duplicate', id: best.candidate.id } : { kind: 'create' }
}

function closeness(candidate: MatchCandidate, incoming: IncomingCharge): number {
  return Math.abs(candidate.amount - incoming.amount) + Math.abs(daysBetween(candidate.date, incoming.date)) * 100
}

// Which source each field trusts most (VISION.md §3.4, "Each source wins on what it knows best").
const TRUST: Record<'amount' | 'merchant' | 'line_items', Record<SourceKind, number>> = {
  amount: { statement: 3, photo: 2, document: 2, email: 2, talk: 1, other: 1 },
  merchant: { photo: 3, document: 3, email: 3, talk: 2, statement: 1, other: 1 },
  line_items: { photo: 3, document: 3, email: 3, talk: 2, statement: 1, other: 1 },
}

export interface ExistingTransaction {
  amount: Cents
  date: LocalDate
  merchant: string | null
  main_category: string | null
  lines: Line[]
  checked_groups: string[]
  private: boolean
  user_edited: string[]
  source_kinds: SourceKind[]
}

export interface IncomingSource {
  kind: SourceKind
  amount: Cents
  date: LocalDate
  merchant: string | null
  // The source's own reading of the purchase, rest line included.
  lines: Line[]
  checked_groups: string[]
  private: boolean
}

export type ChangedField = 'amount' | 'date' | 'merchant' | 'line_items' | 'checked_groups' | 'private'

export interface FieldChange {
  field: ChangedField
  from: unknown
  to: unknown
}

export interface KeptField extends FieldChange {
  reason: 'user_edit' | 'line_items_exceed_amount'
}

export interface Reconciled {
  amount: Cents
  date: LocalDate
  merchant: string | null
  lines: Line[]
  checked_groups: string[]
  private: boolean
  changes: FieldChange[]
  kept: KeptField[]
}

// Merges a new source into a matched transaction. The agent tells the user about every change, and the user's own edits win.
export function reconcile(existing: ExistingTransaction, incoming: IncomingSource): Reconciled {
  const result: Reconciled = {
    amount: existing.amount,
    date: existing.date,
    merchant: existing.merchant,
    lines: existing.lines,
    checked_groups: existing.checked_groups,
    private: existing.private,
    changes: [],
    kept: [],
  }
  const trusted = (field: keyof typeof TRUST) =>
    TRUST[field][incoming.kind] > Math.max(0, ...existing.source_kinds.map((kind) => TRUST[field][kind]))
  const edited = (field: string) => existing.user_edited.includes(field)

  if (trusted('amount')) {
    if (incoming.date !== existing.date) {
      if (edited('date')) result.kept.push({ field: 'date', from: existing.date, to: incoming.date, reason: 'user_edit' })
      else {
        result.changes.push({ field: 'date', from: existing.date, to: incoming.date })
        result.date = incoming.date
      }
    }
    if (incoming.amount !== existing.amount) {
      if (edited('amount')) result.kept.push({ field: 'amount', from: existing.amount, to: incoming.amount, reason: 'user_edit' })
      else {
        const resized = resizeLines(existing.lines, incoming.amount, existing.main_category)
        if (resized.ok) {
          result.changes.push({ field: 'amount', from: existing.amount, to: incoming.amount })
          result.amount = incoming.amount
          result.lines = resized.value
        } else {
          result.kept.push({ field: 'amount', from: existing.amount, to: incoming.amount, reason: 'line_items_exceed_amount' })
        }
      }
    }
  }

  if (incoming.merchant && incoming.merchant !== existing.merchant && (trusted('merchant') || !existing.merchant)) {
    if (edited('merchant')) result.kept.push({ field: 'merchant', from: existing.merchant, to: incoming.merchant, reason: 'user_edit' })
    else {
      result.changes.push({ field: 'merchant', from: existing.merchant, to: incoming.merchant })
      result.merchant = incoming.merchant
    }
  }

  if (incoming.lines.length > 0 && trusted('line_items') && !sameLines(existing.lines, incoming.lines)) {
    if (edited('line_items')) {
      result.kept.push({ field: 'line_items', from: existing.lines, to: incoming.lines, reason: 'user_edit' })
    } else {
      const incomingRest = incoming.lines.find((line) => line.is_rest)
      const rebuilt = buildLines({
        amount: result.amount,
        category: incomingRest?.category ?? existing.lines.find((line) => line.is_rest)?.category ?? existing.main_category,
        spent_for: incomingRest?.spent_for ?? [],
        line_items: incoming.lines.filter((line) => !line.is_rest),
      })
      if (rebuilt.ok) {
        result.changes.push({ field: 'line_items', from: existing.lines, to: rebuilt.value })
        result.lines = rebuilt.value
      } else {
        result.kept.push({ field: 'line_items', from: existing.lines, to: incoming.lines, reason: 'line_items_exceed_amount' })
      }
    }
  }

  // Privacy only ever turns on from a new source; turning it off is the user's own edit.
  if (incoming.private && !existing.private) {
    result.private = true
    result.changes.push({ field: 'private', from: false, to: true })
  }

  const added = incoming.checked_groups.filter((group) => !existing.checked_groups.includes(group))
  if (added.length > 0) {
    result.checked_groups = [...existing.checked_groups, ...added]
    result.changes.push({ field: 'checked_groups', from: existing.checked_groups, to: result.checked_groups })
  }
  return result
}

function sameLines(a: Line[], b: Line[]): boolean {
  const key = (lines: Line[]) =>
    JSON.stringify(lines.map((l) => [l.is_rest ? null : l.amount, l.category.toLowerCase(), l.item ?? null, (l.spent_for ?? []).map((s) => [s.cost_center.toLowerCase(), s.share ?? null])]))
  return key(a) === key(b)
}