import { describe, expect, it } from 'vitest'
import { fromAcceptLanguage, pickLanguage } from '../../src/domain/language.js'
import { requestLanguage } from '../../src/oauth/language.js'

describe('language', () => {
  it('reads the browser\'s languages in order', () => {
    expect(fromAcceptLanguage('ru-RU,ru;q=0.9,en;q=0.8')).toBe('ru')
    expect(fromAcceptLanguage('de-DE,en;q=0.5')).toBe('en')
    expect(fromAcceptLanguage(undefined)).toBe('en')
  })

  it('prefers the saved choice, then the cookie', () => {
    expect(pickLanguage('ru', 'en', 'en')).toBe('ru')
    expect(pickLanguage(null, 'ru', 'en')).toBe('ru')
    expect(pickLanguage(null, undefined, 'ru')).toBe('ru')
  })

  it('reads a signed-out page\'s language from the cookie, else the browser', () => {
    expect(requestLanguage('a=1; kept_lang=ru', 'en-US')).toBe('ru')
    expect(requestLanguage('kept_lang=xx', 'ru-RU,ru;q=0.9')).toBe('ru')
    expect(requestLanguage(undefined, undefined)).toBe('en')
  })
})