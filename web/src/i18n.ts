import { ru } from './locales/ru.js'

// English and Russian (VISION.md §4.C). Strings stay English in the code; `t` finds the Russian, or shows the English.
// The member's saved language wins; signed out, the cookie the language menu sets; then the browser's.

export type Language = 'en' | 'ru'

const COOKIE = 'kept_lang'

function cookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  return document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`))?.split('=')[1]
}

let current: Language = (() => {
  const saved = cookie()
  if (saved === 'en' || saved === 'ru') return saved
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
})()

export const language = () => current
export const locale = () => (current === 'ru' ? 'ru-RU' : 'en-US')

export function setLanguage(lang: Language) {
  current = lang
  document.documentElement.lang = lang
  document.cookie = `${COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`
}

const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : text

export function t(text: string, vars?: Record<string, string | number>): string {
  return fill(current === 'ru' ? (ru[text] ?? text) : text, vars)
}

// "{n} purchase" / "{n} purchases" in English; Russian has one, few and many: 1 покупка, 2 покупки, 12 покупок.
export function plural(n: number, en: [string, string], ruForms: [string, string, string]): string {
  if (current === 'ru') {
    const form = new Intl.PluralRules('ru').select(n)
    return fill(form === 'one' ? ruForms[0] : form === 'few' ? ruForms[1] : ruForms[2], { n })
  }
  return fill(n === 1 ? en[0] : en[1], { n })
}
