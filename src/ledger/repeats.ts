import { sql } from 'kysely'
import { inHousehold, type Db, type Tx } from '../db/db.js'
import { isLocalDate, todayIn } from '../domain/dates.js'
import { resizeLines, type Line } from '../domain/lines.js'
import { formatAmount, fromCents, toCents } from '../domain/money.js'
import { dueOccurrences, firstNextDate, nextDateAfterChange, stillToCome, type Frequency, type RepeatTemplate, type Schedule } from '../domain/repeats.js'
import type { Caller } from './caller.js'
import { conflict, invalid, notFound, unwrap } from './errors.js'
import { getTransaction, insertTransaction } from './transactions.js'
import { loadVocabulary } from './vocabulary.js'

// Repeating spending (VISION.md §3.5).

const FREQUENCIES: Frequency[] = ['weekly', 'monthly', 'yearly']

export interface RepeatView {
  id: string
  frequency: Frequency
  interval: number
  anchor: string
  next_date: string
  ends_on: string | null
  remaining: number | null
  paused: boolean
  amount: number
  merchant: string | null
  category: string | null
  spent_for: string[]
  last: { amount: number; date: string } | null
}

export async function listRepeats(tx: Tx, caller: Caller, now = new Date()) {
  const rows = await tx.selectFrom('repeats').selectAll().where('user_id', '=', caller.user_id).orderBy('paused').orderBy('next_date').execute()
  const logged = rows.length
    ? await tx.selectFrom('transactions').select(['repeat_id', 'amount', 'date']).where('spent_by', '=', caller.user_id).where('repeat_id', 'in', rows.map((r) => r.id)).orderBy('date', 'desc').execute()
    : []
  const today = todayIn(caller.timezone, now)
  const month = today.slice(0, 7)
  const repeats = rows.map((row) => {
    const last = logged.find((t) => t.repeat_id === row.id)
    return { ...view(row), last: last ? { amount: fromCents(toCents(Number(last.amount))), date: last.date } : null }
  })
  const loggedCents = logged.filter((t) => t.date.startsWith(month)).reduce((sum, t) => sum + toCents(Number(t.amount)), 0)
  const toCome = stillToCome(rows.map((r) => ({ ...r, amount: toCents(r.template.amount) })), today)
  return { repeats, month: { month, total: fromCents(loggedCents + toCome), to_come: fromCents(toCome) } }
}

function view(row: { id: string; frequency: Frequency; interval: number; anchor: string; next_date: string; ends_on: string | null; remaining: number | null; paused: boolean; template: RepeatTemplate }): RepeatView {
  return {
    id: row.id,
    frequency: row.frequency,
    interval: row.interval,
    anchor: row.anchor,
    next_date: row.next_date,
    ends_on: row.ends_on,
    remaining: row.remaining,
    paused: row.paused,
    amount: row.template.amount,
    merchant: row.template.merchant,
    category: row.template.category ?? row.template.line_items.find((l) => l.is_rest)?.category ?? row.template.line_items[0]?.category ?? null,
    spent_for: [...new Set(row.template.line_items.flatMap((l) => (l.spent_for ?? []).map((e) => e.cost_center)))],
    last: null,
  }
}

export interface RepeatBody {
  transaction_id: string
  frequency: string
  interval?: number
  anchor?: string
  ends_on?: string | null
  remaining?: number | null
}

// The transaction is the first occurrence; the next one follows on the schedule.
export async function createRepeat(tx: Tx, caller: Caller, body: RepeatBody): Promise<RepeatView> {
  const source = await getTransaction(tx, caller, body.transaction_id)
  if (source.repeat_id) throw conflict('already_repeats', 'This purchase already repeats. Change that repeat instead.')
  const schedule = checkSchedule({ frequency: body.frequency as Frequency, interval: body.interval ?? 1, anchor: body.anchor ?? source.date })
  checkEnd(body.ends_on, body.remaining)
  const template: RepeatTemplate = {
    amount: source.amount,
    merchant: source.merchant,
    notes: source.notes,
    private: source.private,
    category: source.category,
    line_items: source.line_items.map((l) => ({ amount: l.amount, category: l.category, item: l.item, notes: l.notes, spent_for: l.spent_for, is_rest: l.rest })),
  }
  const row = await tx
    .insertInto('repeats')
    .values({
      household_id: caller.household_id,
      user_id: caller.user_id,
      template: JSON.stringify(template),
      ...schedule,
      next_date: firstNextDate(schedule, source.date),
      ends_on: body.ends_on ?? null,
      remaining: body.remaining ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  await tx.updateTable('transactions').set({ repeat_id: row.id }).where('id', '=', source.id).execute()
  return view(row)
}

export interface RepeatPatch {
  amount?: number
  frequency?: string
  interval?: number
  anchor?: string
  ends_on?: string | null
  remaining?: number | null
  paused?: boolean
}

// Changes apply from the next occurrence; transactions already created stay as they are.
export async function updateRepeat(tx: Tx, caller: Caller, id: string, patch: RepeatPatch, now = new Date()): Promise<RepeatView> {
  const row = await tx.selectFrom('repeats').selectAll().where('id', '=', id).where('user_id', '=', caller.user_id).executeTakeFirst()
  if (!row) throw notFound('Repeat')
  const schedule = checkSchedule({
    frequency: (patch.frequency ?? row.frequency) as Frequency,
    interval: patch.interval ?? row.interval,
    anchor: patch.anchor ?? row.anchor,
  })
  checkEnd(patch.ends_on, patch.remaining)
  const today = todayIn(caller.timezone, now)
  const rescheduled = patch.frequency !== undefined || patch.interval !== undefined || patch.anchor !== undefined
  const resumed = patch.paused === false && row.paused
  const nextDate = nextDateAfterChange(schedule, row.next_date, today, rescheduled || resumed)
  let template = row.template
  if (patch.amount !== undefined) {
    const lines: Line[] = template.line_items.map((l) => ({ ...l, amount: toCents(l.amount), is_rest: l.is_rest ?? false }))
    const resized = unwrap(resizeLines(lines, toCents(patch.amount), template.category))
    template = { ...template, amount: patch.amount, line_items: resized.map((l) => ({ ...l, amount: fromCents(l.amount) })) }
  }
  const updated = await tx
    .updateTable('repeats')
    .set({
      ...schedule,
      next_date: nextDate,
      template: JSON.stringify(template),
      ...(patch.ends_on !== undefined && { ends_on: patch.ends_on }),
      ...(patch.remaining !== undefined && { remaining: patch.remaining }),
      ...(patch.paused !== undefined && { paused: patch.paused }),
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow()
  return view(updated)
}

export async function stopRepeat(tx: Tx, caller: Caller, id: string): Promise<void> {
  const deleted = await tx.deleteFrom('repeats').where('id', '=', id).where('user_id', '=', caller.user_id).returning('id').executeTakeFirst()
  if (!deleted) throw notFound('Repeat')
}

function checkSchedule(schedule: Schedule): Schedule {
  if (!FREQUENCIES.includes(schedule.frequency)) throw invalid('invalid_frequency', 'frequency is weekly, monthly or yearly.')
  if (!Number.isInteger(schedule.interval) || schedule.interval < 1) throw invalid('invalid_interval', 'interval is a whole number of at least 1.')
  if (!isLocalDate(schedule.anchor)) throw invalid('invalid_date', 'anchor must be YYYY-MM-DD.')
  return schedule
}

function checkEnd(endsOn: string | null | undefined, remaining: number | null | undefined) {
  if (endsOn && !isLocalDate(endsOn)) throw invalid('invalid_date', 'ends_on must be YYYY-MM-DD.')
  if (remaining != null && (!Number.isInteger(remaining) || remaining < 0)) throw invalid('invalid_remaining', 'remaining is a whole number.')
}

// Creates every occurrence that has come due, in each owner's time zone, and records an update for the agent to announce.
export async function runDueRepeats(db: Db, now = new Date()): Promise<number> {
  const due = await sql<{ id: string; household_id: string }>`select * from kept_due_repeats()`.execute(db)
  let created = 0
  for (const { id, household_id } of due.rows) {
    created += await inHousehold(db, household_id, async (tx) => {
      const row = await tx.selectFrom('repeats').selectAll().where('id', '=', id).forUpdate().executeTakeFirst()
      if (!row) return 0
      const user = await tx
        .selectFrom('users')
        .innerJoin('households', 'households.id', 'users.household_id')
        .select(['users.id', 'users.name', 'users.role', 'households.timezone', 'households.currency'])
        .where('users.id', '=', row.user_id)
        .executeTakeFirstOrThrow()
      const caller: Caller = { user_id: user.id, household_id, role: user.role, name: user.name, timezone: user.timezone, currency: user.currency }
      const plan = dueOccurrences(row, todayIn(user.timezone, now))
      const vocabulary = await loadVocabulary(tx)
      const template = row.template
      for (const date of plan.dates) {
        const transactionId = await insertTransaction(
          tx,
          caller,
          vocabulary,
          {
            date,
            timezone: user.timezone,
            occurred_at: null,
            amount: toCents(template.amount),
            merchant: template.merchant,
            notes: template.notes,
            private: template.private,
            main_category: template.category,
            lines: template.line_items.map((l) => ({ ...l, amount: toCents(l.amount), is_rest: l.is_rest ?? false })),
            checked_groups: [],
          },
          row.id,
        )
        const label = (template.merchant ?? template.category ?? 'bill').toString()
        await tx
          .insertInto('updates')
          .values({ household_id, user_id: row.user_id, kind: 'repeat_registered', text: `Logged your recurring ${label} bill, ${formatAmount(toCents(template.amount), user.currency)}.`, transaction_id: transactionId })
          .execute()
      }
      if (plan.finished) await tx.deleteFrom('repeats').where('id', '=', id).execute()
      else await tx.updateTable('repeats').set({ next_date: plan.next.next_date, remaining: plan.next.remaining }).where('id', '=', id).execute()
      return plan.dates.length
    })
  }
  return created
}