// Kept's open questions (VISION.md §4.B, "Open questions"): what the member decides, most important first.

export type QuestionKind = 'duplicate' | 'cap' | 'missing_charge' | 'unused_key'

export const ANSWERS: Record<QuestionKind, string[]> = {
  duplicate: ['merge', 'different'],
  cap: ['remove', 'keep'],
  missing_charge: ['stop', 'still_paying'],
  unused_key: ['revoke', 'keep'],
}

const ORDER: QuestionKind[] = ['duplicate', 'cap', 'missing_charge', 'unused_key']

export function questionId(kind: QuestionKind, id: string): string {
  return `${kind}:${id}`
}

export function parseQuestionId(value: string): { kind: QuestionKind; id: string } | null {
  const at = value.indexOf(':')
  const kind = value.slice(0, at) as QuestionKind
  return at > 0 && kind in ANSWERS ? { kind, id: value.slice(at + 1) } : null
}

export function sortQuestions<T extends { kind: QuestionKind; created_at: string }>(questions: T[]): T[] {
  return [...questions].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.created_at.localeCompare(a.created_at))
}

const YEAR_MS = 365 * 86_400_000

// A key nobody has used for a year, unless the member said to keep it within the last year.
export function keyUnused(key: { created_at: Date; last_used_at: Date | null; kept_at: Date | null }, now: Date): boolean {
  const latest = Math.max(key.created_at.getTime(), key.last_used_at?.getTime() ?? 0, key.kept_at?.getTime() ?? 0)
  return now.getTime() - latest > YEAR_MS
}

// The cap period a "keep it" answer silences: this month (YYYY-MM) or this year (YYYY).
export function capPeriodKey(period: 'month' | 'year', today: string): string {
  return period === 'month' ? today.slice(0, 7) : today.slice(0, 4)
}
