// What a purchase's source shows: one date, one total and one merchant, whatever each assistant called them, then anything else it read.

const TOTAL_NAMES = ['amount', 'total', 'grand_total', 'total_amount', 'amount_paid', 'total_paid', 'sum']

export type SourceDetail =
  | { field: 'date' | 'total' | 'merchant'; value: unknown }
  | { field: 'other'; name: string; value: unknown }

const present = (value: unknown) => value != null && value !== ''

export function sourceDetails(extracted: Record<string, unknown> | null): SourceDetail[] {
  const read = new Map(Object.entries(extracted ?? {}).filter(([, value]) => present(value)).map(([name, value]) => [name.toLowerCase().replace(/[\s-]+/g, '_'), value]))
  const known: SourceDetail[] = []
  const date = read.get('date')
  const total = TOTAL_NAMES.map((name) => read.get(name)).find(present)
  const merchant = read.get('merchant')
  if (present(date)) known.push({ field: 'date', value: date })
  if (present(total)) known.push({ field: 'total', value: total })
  if (present(merchant)) known.push({ field: 'merchant', value: merchant })
  const others = [...read].filter(([name]) => name !== 'date' && name !== 'merchant' && !TOTAL_NAMES.includes(name))
  return [...known, ...others.map(([name, value]): SourceDetail => ({ field: 'other', name: name.replace(/_/g, ' '), value }))]
}
