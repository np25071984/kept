import { normalizeMerchant } from './merchants.js'

// Household rules (VISION.md §4.A, "Household Rules").

export const RULE_KINDS = ['watch', 'ask_breakdown', 'set_category', 'set_spent_for', 'set_private'] as const
export type RuleKind = (typeof RULE_KINDS)[number]

export interface Rule {
  id: string
  kind: RuleKind
  user_id: string | null
  merchant: string | null
  category: string | null
  account_ref: string | null
  params: Record<string, unknown>
  text: string
}

export interface RuleContext {
  user_id: string
  merchant?: string | null
  category?: string | null
  account_ref?: string | null
}

export function isUnder(path: string, ancestor: string): boolean {
  const p = path.toLowerCase()
  const a = ancestor.toLowerCase()
  return p === a || p.startsWith(`${a}/`)
}

export function ruleMatches(rule: Rule, context: RuleContext): boolean {
  if (rule.user_id && rule.user_id !== context.user_id) return false
  if (rule.merchant && (!context.merchant || normalizeMerchant(rule.merchant) !== normalizeMerchant(context.merchant))) return false
  if (rule.category && (!context.category || !isUnder(context.category, rule.category))) return false
  if (rule.account_ref && rule.account_ref !== context.account_ref) return false
  return true
}

// More conditions beat fewer, a deeper category beats a broader one, and a personal rule beats a household-wide one.
export function specificity(rule: Rule): [number, number, number] {
  const conditions = [rule.merchant, rule.category, rule.account_ref].filter(Boolean).length
  const depth = rule.category ? rule.category.split('/').length : 0
  return [conditions, depth, rule.user_id ? 1 : 0]
}

function compareSpecificity(a: Rule, b: Rule): number {
  const sa = specificity(a)
  const sb = specificity(b)
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sb[i]! - sa[i]!
  }
  return 0
}

export interface ResolvedRules {
  watch: Rule[]
  ask_breakdown: Rule | null
  set_category: Rule | null
  set_spent_for: Rule | null
  set_private: Rule | null
}

// Every matching watch rule applies; for the other kinds the most specific matching rule wins.
export function resolveRules(rules: Rule[], context: RuleContext): ResolvedRules {
  const matching = rules.filter((rule) => ruleMatches(rule, context)).sort(compareSpecificity)
  const first = (kind: RuleKind) => matching.find((rule) => rule.kind === kind) ?? null
  const seen = new Set<string>()
  const watch = matching.filter((rule) => {
    if (rule.kind !== 'watch') return false
    const key = watchedGroup(rule)?.toLowerCase() ?? rule.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return {
    watch,
    ask_breakdown: first('ask_breakdown'),
    set_category: first('set_category'),
    set_spent_for: first('set_spent_for'),
    set_private: first('set_private'),
  }
}

// A watched group is a subcategory path or an item name (VISION.md §3.3).
export function watchedGroup(rule: Pick<Rule, 'kind' | 'params'>): string | null {
  if (rule.kind !== 'watch') return null
  const { category, item } = rule.params as { category?: unknown; item?: unknown }
  if (typeof category === 'string') return category
  if (typeof item === 'string') return item
  return null
}

export function validateRuleParams(kind: RuleKind, params: Record<string, unknown>): string | null {
  switch (kind) {
    case 'watch': {
      const hasCategory = typeof params.category === 'string'
      const hasItem = typeof params.item === 'string'
      return hasCategory !== hasItem ? null : 'A watch rule needs exactly one of params.category or params.item.'
    }
    case 'set_category':
      return typeof params.category === 'string' ? null : 'A set_category rule needs params.category.'
    case 'set_spent_for':
      return Array.isArray(params.spent_for) && params.spent_for.length > 0 ? null : 'A set_spent_for rule needs params.spent_for.'
    case 'ask_breakdown':
    case 'set_private':
      return null
  }
}