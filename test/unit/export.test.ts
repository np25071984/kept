import { describe, expect, it } from 'vitest'
import { attachmentName, csvCell, purchasesCsv, type CsvPurchase } from '../../src/domain/export.js'

const purchase: CsvPurchase = {
  id: 'p1',
  date: '2026-10-26',
  amount: 40,
  merchant: 'Target',
  notes: null,
  private: false,
  line_items: [
    { category: 'Clothing', item: 'shoes', spent_for: [{ cost_center: 'Zoe' }] },
    { category: 'Housing', item: 'curtains', spent_for: [{ cost_center: 'Zoe' }, { cost_center: 'Home' }] },
    { category: 'Groceries', item: null, spent_for: [] },
  ],
}

const lines = (csv: string) => csv.replace('﻿', '').trimEnd().split('\r\n')

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('Trader Joe')).toBe('Trader Joe')
    expect(csvCell('60.40')).toBe('60.40')
  })

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Smith, Jones')).toBe('"Smith, Jones"')
    expect(csvCell('the "good" one')).toBe('"the ""good"" one"')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx', '  =1+1', '＝1+1'])('keeps %j from running as a formula', (value) => {
    expect(csvCell(value).replace(/^"/, '').startsWith(`'`)).toBe(true)
  })

  it('escapes a formula that also needs quoting', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`)
  })

  it('leaves a formula character later in the text alone', () => {
    expect(csvCell('AT&T = phone')).toBe('AT&T = phone')
  })
})

describe('purchasesCsv', () => {
  it('writes one row per purchase, however many line items', () => {
    expect(lines(purchasesCsv([purchase], 'USD'))).toEqual([
      'date,merchant,amount,currency,categories,items,people_and_things,private,notes,id',
      '2026-10-26,Target,40.00,USD,Clothing; Housing; Groceries,shoes; curtains,Zoe; Home,no,,p1',
    ])
  })

  it('follows the decimals of the currency', () => {
    expect(lines(purchasesCsv([{ ...purchase, amount: 4000 }], 'JPY'))[1]).toContain(',4000,JPY,')
  })

  it('marks private purchases and leaves missing values empty', () => {
    expect(lines(purchasesCsv([{ ...purchase, merchant: null, private: true, line_items: [] }], 'USD'))[1]).toBe('2026-10-26,,40.00,USD,,,,yes,,p1')
  })

  it('escapes merchants and notes taken from receipts', () => {
    const [, row] = lines(purchasesCsv([{ ...purchase, merchant: '=cmd()', notes: '@risk' }], 'USD'))
    expect(row).toContain(`,'=cmd(),`)
    expect(row).toContain(`,'@risk,`)
  })

  it('starts with a byte order mark so Excel reads Russian text', () => {
    expect(purchasesCsv([], 'USD').startsWith('﻿date,')).toBe(true)
  })
})

describe('attachmentName', () => {
  it('reads the name from the header', () => {
    expect(attachmentName('attachment; filename="kept-export-2026-11-04.json"', 'x.json')).toBe('kept-export-2026-11-04.json')
  })

  it('falls back without one', () => {
    expect(attachmentName(null, 'x.json')).toBe('x.json')
    expect(attachmentName('attachment', 'x.json')).toBe('x.json')
  })
})
