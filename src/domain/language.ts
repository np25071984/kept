// English and Russian (VISION.md §4.C). The member's choice wins, then a cookie for signed-out pages, then the browser's.

const LANGUAGES = ['en', 'ru'] as const
export type Language = (typeof LANGUAGES)[number]

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

// The first supported language in an Accept-Language header, else English.
export function fromAcceptLanguage(header: string | undefined): Language {
  for (const part of (header ?? '').split(',')) {
    const code = part.trim().split(';')[0]!.slice(0, 2).toLowerCase()
    if (isLanguage(code)) return code
  }
  return 'en'
}

export function pickLanguage(saved: string | null | undefined, cookie: string | undefined, accept: string | undefined): Language {
  if (isLanguage(saved)) return saved
  if (isLanguage(cookie)) return cookie
  return fromAcceptLanguage(accept)
}

export const SEED_CATEGORIES_RU = ['Продукты', 'Кафе и рестораны', 'Машина', 'Жильё', 'Здоровье', 'Одежда', 'Путешествия', 'Другое']
