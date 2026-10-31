import { tr } from '../i18n.js'
import type { Language } from './language.js'
import { formatAmount, type Cents } from './money.js'

// What the ledger tells a member it did on its own, stored in their language: the agent repeats it and the web shows it
// (VISION.md §3.5, "What happens on the date").

export function repeatLoggedText(label: string, amount: Cents, currency: string, lang: Language): string {
  return tr(lang, 'Logged your recurring {label} bill, {amount}.', { label, amount: formatAmount(amount, currency, lang) })
}

export interface Purchase {
  amount: Cents
  merchant: string | null
  date: string
}

export function duplicateText(later: Purchase, first: Purchase, currency: string, lang: Language): string {
  const describe = (p: Purchase) => p.merchant
    ? tr(lang, '{amount} at {merchant}', { amount: formatAmount(p.amount, currency, lang), merchant: p.merchant })
    : formatAmount(p.amount, currency, lang)
  return tr(lang, 'Is the {later} on {laterDate} the {first} logged on {firstDate}?', { later: describe(later), laterDate: later.date, first: describe(first), firstDate: first.date })
}

export function missingChargeText(name: string, period: string, lang: Language): string {
  return tr(lang, 'No {name} charge on your {period} statement. Did you cancel it?', { name, period })
}
