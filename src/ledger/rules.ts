import type { Tx } from '../db/db.js'
import { validateShares } from '../domain/lines.js'
import { RULE_KINDS, resolveRules, ruleMatches, validateRuleParams, type Rule, type RuleKind } from '../domain/rules.js'
import type { Caller } from './caller.js'
import { invalid, notFound, unwrap } from './errors.js'
import { loadVocabulary } from './vocabulary.js'

// Household-wide rules plus the caller's personal ones; other members' personal rules stay invisible.
export async function loadRules(tx: Tx, caller: Caller): Promise<Rule[]> {
  const rows = await tx
    .selectFrom('rules')
    .leftJoin('categories', 'categories.id', 'rules.category_id')
    .select(['rules.id', 'rules.kind', 'rules.user_id', 'rules.merchant', 'categories.path as category', 'rules.account_ref', 'rules.params', 'rules.text'])
    .where((eb) => eb.or([eb('rules.user_id', 'is', null), eb('rules.user_id', '=', caller.user_id)]))
    .orderBy('rules.created_at')
    .execute()
  return rows.map((row) => ({ ...row, kind: row.kind as RuleKind, category: row.category ?? null }))
}

export interface RuleQuery {
  merchant?: string
  category?: string
  account_ref?: string
}

export async function getRules(tx: Tx, caller: Caller, query: RuleQuery) {
  const rules = await loadRules(tx, caller)
  const filtered = query.merchant || query.category || query.account_ref
  if (!filtered) return { rules: rules.map(view) }
  const context = { user_id: caller.user_id, ...query }
  const resolved = resolveRules(rules, context)
  return {
    rules: rules.filter((rule) => ruleMatches(rule, context)).map(view),
    resolved: {
      watch: resolved.watch.map(view),
      ask_breakdown: resolved.ask_breakdown && view(resolved.ask_breakdown),
      set_category: resolved.set_category && view(resolved.set_category),
      set_spent_for: resolved.set_spent_for && view(resolved.set_spent_for),
      set_private: resolved.set_private && view(resolved.set_private),
    },
  }
}

function view(rule: Rule) {
  return { id: rule.id, kind: rule.kind, personal: rule.user_id != null, merchant: rule.merchant, category: rule.category, account_ref: rule.account_ref, params: rule.params, text: rule.text }
}

export interface RuleBody {
  kind: string
  merchant?: string | null
  category?: string | null
  account_ref?: string | null
  params?: Record<string, unknown>
  text: string
  personal?: boolean
}

export async function saveRule(tx: Tx, caller: Caller, body: RuleBody) {
  if (!(RULE_KINDS as readonly string[]).includes(body.kind)) throw invalid('invalid_rule_kind', `Rule kind is one of ${RULE_KINDS.join(', ')}.`)
  const kind = body.kind as RuleKind
  const params = body.params ?? {}
  const problem = validateRuleParams(kind, params)
  if (problem) throw invalid('invalid_rule_params', problem)
  const vocabulary = await loadVocabulary(tx)
  // Paths and names in params must already exist, and are stored as the household spells them.
  if (typeof params.category === 'string') params.category = vocabulary.categoryPath(vocabulary.categoryId(params.category))
  if (kind === 'set_spent_for') {
    const entries = unwrap(validateShares(params.spent_for as { cost_center: string; share?: number }[]))
    params.spent_for = entries.map((e) => ({ cost_center: vocabulary.costCenterName(vocabulary.costCenterId(e.cost_center)), ...(e.share != null && { share: e.share }) }))
  }
  // A private purchase must not show up in a household-wide rule (VISION.md §4.A).
  const personal = kind === 'set_private' || body.personal === true
  const { id } = await tx
    .insertInto('rules')
    .values({
      household_id: caller.household_id,
      kind,
      user_id: personal ? caller.user_id : null,
      merchant: body.merchant?.trim() || null,
      category_id: body.category ? vocabulary.categoryId(body.category) : null,
      account_ref: body.account_ref?.trim() || null,
      params: JSON.stringify(params),
      text: body.text,
      created_by: caller.user_id,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const saved = (await loadRules(tx, caller)).find((rule) => rule.id === id)!
  return view(saved)
}

export async function deleteRule(tx: Tx, caller: Caller, id: string) {
  const rule = await tx.selectFrom('rules').select(['id', 'user_id']).where('id', '=', id).executeTakeFirst()
  // Another member's personal rule is invisible, so it is "not found" rather than "forbidden".
  if (!rule || (rule.user_id && rule.user_id !== caller.user_id)) throw notFound('Rule')
  await tx.deleteFrom('rules').where('id', '=', id).execute()
}