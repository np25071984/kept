import { sql } from 'kysely'
import type { Tx } from '../db/db.js'
import { todayIn } from '../domain/dates.js'
import { ANSWERS, capPeriodKey, keyUnused, needsAssistant, parseQuestionId, questionId, sortQuestions, type QuestionKind } from '../domain/questions.js'
import { WEB_CLIENT_ID } from '../oauth/provider.js'
import { deleteCap, listCaps } from './caps.js'
import type { Caller } from './caller.js'
import { invalid, notFound } from './errors.js'
import { revokeApiKey } from './households.js'
import { stopRepeat } from './repeats.js'
import { loadViews, mergeTransactions, type TransactionView } from './transactions.js'

// Kept's open questions for the caller (VISION.md §4.B, "Open questions"): Notifications on the web, one per conversation in chat.

export type Question =
  | { id: string; kind: 'connect'; created_at: string }
  | { id: string; kind: 'duplicate'; created_at: string; first: TransactionView; later: TransactionView }
  | { id: string; kind: 'cap'; created_at: string; cap: { id: string; name: string; amount: number; spent: number; period: 'month' | 'year' } }
  | { id: string; kind: 'missing_charge'; created_at: string; text: string; repeat_id: string }
  | { id: string; kind: 'unused_key'; created_at: string; key: { id: string; name: string; last_used_at: string | null } }

export async function listQuestions(tx: Tx, caller: Caller, now = new Date()): Promise<Question[]> {
  const today = todayIn(caller.timezone, now)
  const updates = await tx.selectFrom('updates').select(['id', 'kind', 'text', 'transaction_id', 'other_transaction_id', 'repeat_id', 'created_at'])
    .where('user_id', '=', caller.user_id).where('resolved_at', 'is', null).where('kind', 'in', ['possible_duplicate', 'missing_charge']).execute()
  const pairs = updates.filter((u) => u.kind === 'possible_duplicate' && u.transaction_id && u.other_transaction_id)
  const views = await loadViews(tx, caller, pairs.flatMap((u) => [u.transaction_id!, u.other_transaction_id!]))
  const byId = new Map(views.map((v) => [v.id, v]))
  const questions: Question[] = []
  for (const u of pairs) {
    const later = byId.get(u.transaction_id!)
    const first = byId.get(u.other_transaction_id!)
    if (first && later) questions.push({ id: questionId('duplicate', u.id), kind: 'duplicate', created_at: new Date(u.created_at).toISOString(), first, later })
  }
  for (const u of updates.filter((x) => x.kind === 'missing_charge' && x.repeat_id)) {
    questions.push({ id: questionId('missing_charge', u.id), kind: 'missing_charge', created_at: new Date(u.created_at).toISOString(), text: u.text, repeat_id: u.repeat_id! })
  }
  const kept = new Map((await tx.selectFrom('caps').select(['id', 'kept_period']).where('user_id', '=', caller.user_id).execute()).map((c) => [c.id, c.kept_period]))
  for (const cap of await listCaps(tx, caller, now)) {
    if (cap.state !== 'over' || kept.get(cap.id) === capPeriodKey(cap.period, today)) continue
    questions.push({ id: questionId('cap', cap.id), kind: 'cap', created_at: now.toISOString(), cap: { id: cap.id, name: (cap.category ?? cap.cost_center)!, amount: cap.amount, spent: cap.spent, period: cap.period } })
  }
  const keys = await tx.selectFrom('api_keys').select(['id', 'name', 'created_at', 'last_used_at', 'kept_at']).where('user_id', '=', caller.user_id).where('revoked_at', 'is', null).execute()
  for (const key of keys) {
    const k = { created_at: new Date(key.created_at), last_used_at: key.last_used_at ? new Date(key.last_used_at) : null, kept_at: key.kept_at ? new Date(key.kept_at) : null }
    if (!keyUnused(k, now)) continue
    questions.push({ id: questionId('unused_key', key.id), kind: 'unused_key', created_at: (k.last_used_at ?? k.created_at).toISOString(), key: { id: key.id, name: key.name, last_used_at: k.last_used_at?.toISOString() ?? null } })
  }
  const grants = await tx.selectFrom('oauth_models').select(sql<string>`payload->>'clientId'`.as('client_id'))
    .where('name', '=', 'Grant').where(sql`payload->>'accountId'`, '=', caller.user_id)
    .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)])).execute()
  if (needsAssistant(grants.map((g) => g.client_id), WEB_CLIENT_ID, keys.length)) questions.push({ id: questionId('connect', caller.user_id), kind: 'connect', created_at: now.toISOString() })
  return sortQuestions(questions)
}

export async function answerQuestion(tx: Tx, caller: Caller, id: string, answer: string, now = new Date()): Promise<void> {
  const parsed = parseQuestionId(id)
  if (!parsed) throw notFound('Question')
  if (!ANSWERS[parsed.kind].includes(answer)) throw invalid('invalid_answer', `Answer with one of: ${ANSWERS[parsed.kind].join(', ')}.`)
  const resolve = () => tx.updateTable('updates').set({ resolved_at: now, seen_at: now }).where('id', '=', parsed.id).where('user_id', '=', caller.user_id).execute()
  const kinds: Record<QuestionKind, () => Promise<unknown>> = {
    connect: async () => undefined,
    duplicate: async () => {
      const u = await tx.selectFrom('updates').select(['transaction_id', 'other_transaction_id']).where('id', '=', parsed.id).where('user_id', '=', caller.user_id).executeTakeFirst()
      if (!u?.transaction_id || !u.other_transaction_id) throw notFound('Question')
      // Merging keeps the purchase logged first and adds the later one's sources to it.
      if (answer === 'merge') await mergeTransactions(tx, caller, u.other_transaction_id, u.transaction_id)
      else await resolve()
    },
    missing_charge: async () => {
      const u = await tx.selectFrom('updates').select('repeat_id').where('id', '=', parsed.id).where('user_id', '=', caller.user_id).executeTakeFirst()
      if (!u?.repeat_id) throw notFound('Question')
      await resolve()
      if (answer === 'stop') await stopRepeat(tx, caller, u.repeat_id)
    },
    cap: async () => {
      if (answer === 'remove') return deleteCap(tx, caller, parsed.id)
      const cap = await tx.selectFrom('caps').select('period').where('id', '=', parsed.id).where('user_id', '=', caller.user_id).executeTakeFirst()
      if (!cap) throw notFound('Cap')
      await tx.updateTable('caps').set({ kept_period: capPeriodKey(cap.period, todayIn(caller.timezone, now)) }).where('id', '=', parsed.id).execute()
    },
    unused_key: async () => {
      if (answer === 'revoke') return revokeApiKey(tx, caller, parsed.id)
      await tx.updateTable('api_keys').set({ kept_at: now }).where('id', '=', parsed.id).where('user_id', '=', caller.user_id).execute()
    },
  }
  await kinds[parsed.kind]()
}

// The agent saw a statement without a recurring charge and the user didn't settle it in chat.
export async function flagMissingCharge(tx: Tx, caller: Caller, repeatId: string, period: string) {
  const repeat = await tx.selectFrom('repeats').select(['id', 'template']).where('id', '=', repeatId).where('user_id', '=', caller.user_id).executeTakeFirst()
  if (!repeat) throw notFound('Repeat')
  const name = repeat.template.merchant ?? repeat.template.category ?? 'recurring'
  const text = `No ${name} charge on your ${period} statement. Did you cancel it?`
  const { id } = await tx.insertInto('updates').values({ household_id: caller.household_id, user_id: caller.user_id, kind: 'missing_charge', text, repeat_id: repeatId, seen_at: new Date() }).returning('id').executeTakeFirstOrThrow()
  return { id: questionId('missing_charge', id), text }
}
