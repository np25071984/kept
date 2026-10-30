import { fold } from './timezones.js'

// The currency picker's list: each code with its name in the page's language, searchable by either, ignoring case
// and accents. A code the runtime has no name for shows the code alone.

export interface CurrencyOption {
  id: string
  name: string
}

export function currencyOptions(codes: string[], nameOf: (code: string) => string | undefined): CurrencyOption[] {
  return codes.map((id) => ({ id, name: nameOf(id) ?? id }))
}

export function searchCurrencies(options: CurrencyOption[], query: string): CurrencyOption[] {
  const q = fold(query.trim())
  if (!q) return options
  return options.filter((o) => fold(o.id).includes(q) || fold(o.name).includes(q))
}
