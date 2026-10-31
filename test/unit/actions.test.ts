import { describe, expect, it } from 'vitest'
import { capCall, noteCall, query, repeatCall, vocabularyCall, watchCall } from '../../src/mcp/actions.js'

const id = '0b6c3c1e-6f0e-4a8e-9d3a-2f1f4c5d6e7f'
const missing = (field: string) => ({ ok: false, error: { code: 'missing_field', message: expect.stringContaining(field) } })

describe('query', () => {
  it('repeats the key for an array and skips empty values', () => {
    expect(query({ category: ['Car', 'Groceries'], merchant: 'Shell', item: undefined, to: null })).toBe('?category=Car&category=Groceries&merchant=Shell')
    expect(query({})).toBe('')
  })
})

describe('vocabularyCall', () => {
  it('sends a category as a path and a cost center as a name', () => {
    expect(vocabularyCall({ action: 'add', what: 'category', name: 'Car/Fuel' })).toEqual({ ok: true, call: { method: 'POST', url: '/api/v1/categories', body: { path: 'Car/Fuel' } } })
    expect(vocabularyCall({ action: 'add', what: 'cost_center', name: 'Kia', kind: 'Car' })).toEqual({ ok: true, call: { method: 'POST', url: '/api/v1/cost-centers', body: { name: 'Kia', kind: 'Car' } } })
  })

  it('renames and deletes by the old name', () => {
    expect(vocabularyCall({ action: 'rename', what: 'category', name: 'Gas', new_name: 'Car/Fuel' })).toEqual({ ok: true, call: { method: 'PATCH', url: '/api/v1/categories', body: { path: 'Gas', new_path: 'Car/Fuel' } } })
    expect(vocabularyCall({ action: 'rename', what: 'cost_center', name: 'Iva', new_name: 'Ivy' })).toEqual({ ok: true, call: { method: 'PATCH', url: '/api/v1/cost-centers', body: { name: 'Iva', new_name: 'Ivy' } } })
    expect(vocabularyCall({ action: 'delete', what: 'category', name: 'Car/Fuel' })).toEqual({ ok: true, call: { method: 'DELETE', url: '/api/v1/categories?path=Car%2FFuel' } })
    expect(vocabularyCall({ action: 'delete', what: 'cost_center', name: 'Iva' })).toEqual({ ok: true, call: { method: 'DELETE', url: '/api/v1/cost-centers?name=Iva' } })
  })

  it('names the tool\'s own parameter when one is missing', () => {
    expect(vocabularyCall({ action: 'rename', what: 'category', name: 'Gas' })).toEqual(missing('new_name'))
    expect(vocabularyCall({ action: 'add', what: 'cost_center', name: 'Kia' })).toEqual(missing('kind'))
  })
})

describe('watchCall', () => {
  it('starts with a category or item and stops by id', () => {
    expect(watchCall({ action: 'start', item: 'snacks' })).toEqual({ ok: true, call: { method: 'POST', url: '/api/v1/watches', body: { item: 'snacks' } } })
    expect(watchCall({ action: 'stop', id })).toEqual({ ok: true, call: { method: 'DELETE', url: `/api/v1/watches/${id}` } })
    expect(watchCall({ action: 'stop' })).toEqual(missing('id'))
  })
})

describe('capCall', () => {
  it('sets, changes and removes', () => {
    expect(capCall({ action: 'set', category: 'Groceries', amount: 1000, period: 'month' })).toEqual({ ok: true, call: { method: 'POST', url: '/api/v1/caps', body: { category: 'Groceries', amount: 1000, period: 'month' } } })
    expect(capCall({ action: 'change', id, amount: 1200 })).toEqual({ ok: true, call: { method: 'PATCH', url: `/api/v1/caps/${id}`, body: { amount: 1200 } } })
    expect(capCall({ action: 'remove', id })).toEqual({ ok: true, call: { method: 'DELETE', url: `/api/v1/caps/${id}` } })
  })

  it('sends only the fields the action takes', () => {
    expect(capCall({ action: 'change', id, category: 'Groceries', period: 'year' })).toEqual({ ok: true, call: { method: 'PATCH', url: `/api/v1/caps/${id}`, body: { period: 'year' } } })
  })

  it('needs an id to change or remove', () => {
    expect(capCall({ action: 'change', amount: 5 })).toEqual(missing('id'))
    expect(capCall({ action: 'remove' })).toEqual(missing('id'))
  })
})

describe('noteCall', () => {
  it('saves, updates and deletes', () => {
    expect(noteCall({ action: 'save', text: 'Costco is always groceries.' })).toEqual({ ok: true, call: { method: 'POST', url: '/api/v1/notes', body: { text: 'Costco is always groceries.' } } })
    expect(noteCall({ action: 'update', id, text: 'Costco is groceries.' })).toEqual({ ok: true, call: { method: 'PATCH', url: `/api/v1/notes/${id}`, body: { text: 'Costco is groceries.' } } })
    expect(noteCall({ action: 'delete', id })).toEqual({ ok: true, call: { method: 'DELETE', url: `/api/v1/notes/${id}` } })
  })

  it('needs text to save or update, and an id to update or delete', () => {
    expect(noteCall({ action: 'save' })).toEqual(missing('text'))
    expect(noteCall({ action: 'update', text: 'x' })).toEqual(missing('id'))
    expect(noteCall({ action: 'delete' })).toEqual(missing('id'))
  })
})

describe('repeatCall', () => {
  it('lists without a body', () => {
    expect(repeatCall({ action: 'list', id })).toEqual({ ok: true, call: { method: 'GET', url: '/api/v1/repeats' } })
  })

  it('sets from a purchase with its schedule, leaving out update-only fields', () => {
    expect(repeatCall({ action: 'set', transaction_id: id, frequency: 'monthly', amount: 55, paused: true })).toEqual({ ok: true, call: { method: 'POST', url: '/api/v1/repeats', body: { transaction_id: id, frequency: 'monthly' } } })
    expect(repeatCall({ action: 'set', frequency: 'monthly' })).toEqual(missing('transaction_id'))
  })

  it('updates with null clearing an end, and stops by id', () => {
    expect(repeatCall({ action: 'update', id, amount: 55, ends_on: null, paused: false })).toEqual({ ok: true, call: { method: 'PATCH', url: `/api/v1/repeats/${id}`, body: { amount: 55, ends_on: null, paused: false } } })
    expect(repeatCall({ action: 'stop', id })).toEqual({ ok: true, call: { method: 'DELETE', url: `/api/v1/repeats/${id}` } })
    expect(repeatCall({ action: 'stop' })).toEqual(missing('id'))
  })
})