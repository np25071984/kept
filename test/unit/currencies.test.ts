import { describe, expect, it } from 'vitest'
import { currencyOptions, searchCurrencies } from '../../src/domain/currencies.js'

const names = (lang: string) => {
  const display = new Intl.DisplayNames(lang, { type: 'currency' })
  return (code: string) => display.of(code)
}

describe('currencies', () => {
  it('names each code in the page\'s language', () => {
    expect(currencyOptions(['EUR', 'RUB'], names('en'))).toEqual([{ id: 'EUR', name: 'Euro' }, { id: 'RUB', name: 'Russian Ruble' }])
    expect(currencyOptions(['EUR'], names('ru'))[0]!.name).toBe('евро')
    expect(currencyOptions(['XYZ'], () => undefined)).toEqual([{ id: 'XYZ', name: 'XYZ' }])
  })

  it('finds a currency by code or by name, ignoring case', () => {
    const options = currencyOptions(['USD', 'EUR', 'GBP'], names('en'))
    expect(searchCurrencies(options, 'eur').map((o) => o.id)).toEqual(['EUR'])
    expect(searchCurrencies(options, 'POUND').map((o) => o.id)).toEqual(['GBP'])
    expect(searchCurrencies(options, ' ')).toHaveLength(3)
  })
})
