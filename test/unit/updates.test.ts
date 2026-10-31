import { describe, expect, it } from 'vitest'
import { duplicateText, missingChargeText, repeatLoggedText } from '../../src/domain/updates.js'

describe('update texts', () => {
  it('reads in English', () => {
    expect(repeatLoggedText('Verizon', 5000, 'USD', 'en')).toBe('Logged your recurring Verizon bill, $50.00.')
    expect(duplicateText({ amount: 4112, merchant: null, date: '2026-10-27' }, { amount: 4000, merchant: 'Target', date: '2026-10-26' }, 'USD', 'en'))
      .toBe('Is the $41.12 on 2026-10-27 the $40.00 at Target logged on 2026-10-26?')
    expect(missingChargeText('Spotify', 'October', 'en')).toBe('No Spotify charge on your October statement. Did you cancel it?')
  })

  it('reads in Russian, with Russian number formatting', () => {
    expect(repeatLoggedText('МТС', 50000, 'RUB', 'ru')).toBe('Записал регулярный платёж «МТС», 500,00 ₽.')
    expect(missingChargeText('Яндекс Плюс', 'октябрь', 'ru')).toBe('В выписке за октябрь нет списания «Яндекс Плюс». Вы его отменили?')
  })
})
