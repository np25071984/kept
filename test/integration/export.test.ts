import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { client, newHousehold, startHarness, type Harness } from './helpers.js'

describe('a member exports their own data', () => {
  let h: Harness
  let sam: ReturnType<typeof client>
  let alex: ReturnType<typeof client>
  let samKey: string
  let otherKey: string

  beforeAll(async () => {
    h = await startHarness()
    const created = await newHousehold(h, 'Secret Household Name')
    samKey = created.api_key
    sam = client(h, samKey)
    await sam.post('/api/v1/categories', { path: 'Car/Fuel' })
    await sam.post('/api/v1/cost-centers', { name: 'Kia', kind: 'Car' })

    await sam.post('/api/v1/invites', { email: 'alex@example.com' })
    const token = h.invites[0]!.link.split('#token=')[1]!
    const accepted = await h.app.inject({ method: 'POST', url: '/api/v1/invites/accept', payload: { token, name: 'Alex' } })
    alex = client(h, accepted.json().api_key)

    const logged = await sam.post('/api/v1/transactions', { date: '2026-10-27', amount: 60, category: 'Car/Fuel', spent_for: [{ cost_center: 'Kia' }], merchant: '=Shell', notes: 'full tank' })
    expect(logged.status).toBe(201)
    await sam.post('/api/v1/transactions', { date: '2026-10-28', amount: 80, category: 'Car/Fuel', merchant: 'Sephora', private: true })
    expect((await sam.post('/api/v1/repeats', { transaction_id: logged.body.transaction.id, frequency: 'monthly' })).status).toBe(201)
    expect((await sam.post('/api/v1/notes', { text: 'Costco is always groceries' })).status).toBe(201)
    expect((await sam.post('/api/v1/watches', { item: 'snacks' })).status).toBe(201)
    expect((await sam.post('/api/v1/caps', { category: 'Car/Fuel', amount: 250, period: 'month' })).status).toBe(201)

    await alex.post('/api/v1/transactions', { date: '2026-10-27', amount: 12, category: 'Car/Fuel', merchant: 'Alex Only Merchant' })
    await alex.post('/api/v1/notes', { text: 'Alex only note' })

    const other = await newHousehold(h, 'Another Household')
    otherKey = other.api_key
    const otherClient = client(h, otherKey)
    await otherClient.post('/api/v1/categories', { path: 'Fun' })
    await otherClient.post('/api/v1/transactions', { date: '2026-10-27', amount: 5, category: 'Fun', merchant: 'Other Household Merchant' })
  })
  afterAll(() => h.close())

  const get = (url: string, key: string) => h.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${key}` } })

  it('refuses a request without a login', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/api/v1/export' })).statusCode).toBe(401)
    expect((await h.app.inject({ method: 'GET', url: '/api/v1/export/purchases.csv' })).statusCode).toBe(401)
  })

  it('gives everything the member owns as a JSON download', async () => {
    const res = await get('/api/v1/export', samKey)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="kept-export-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(res.headers['cache-control']).toBe('no-store')
    const data = res.json()
    expect(data.member).toEqual({ name: 'Sam', email: expect.stringContaining('@example.com') })
    expect(data.currency).toBe('USD')
    expect(data.purchases.map((p: { merchant: string; private: boolean }) => [p.merchant, p.private])).toEqual([['Sephora', true], ['=Shell', false]])
    expect(data.purchases[1].line_items[0]).toMatchObject({ category: 'Car/Fuel', spent_for: [{ cost_center: 'Kia' }] })
    expect(data.notes.map((n: { text: string }) => n.text)).toEqual(['Costco is always groceries'])
    expect(data.watches.map((w: { group: string }) => w.group)).toEqual(['snacks'])
    expect(data.caps).toEqual([{ id: expect.any(String), category: 'Car/Fuel', cost_center: null, amount: 250, period: 'month' }])
    expect(data.repeats[0]).toMatchObject({ frequency: 'monthly', merchant: '=Shell', notes: 'full tank', private: false, line_items: [{ category: 'Car/Fuel', spent_for: [{ cost_center: 'Kia' }] }] })
  })

  it('leaves out other members, other households and household details', async () => {
    const text = (await get('/api/v1/export', samKey)).body + (await get('/api/v1/export/purchases.csv', samKey)).body
    for (const hidden of ['Alex', 'alex@example.com', 'Secret Household Name', 'Other Household Merchant']) expect(text).not.toContain(hidden)
  })

  it('gives another member only their own', async () => {
    const data = (await get('/api/v1/export', (await memberKey()))).json()
    expect(data.member.name).toBe('Alex')
    expect(data.purchases.map((p: { merchant: string }) => p.merchant)).toEqual(['Alex Only Merchant'])
    expect(data.notes.map((n: { text: string }) => n.text)).toEqual(['Alex only note'])
  })

  async function memberKey() {
    const created = await alex.post('/api/v1/api-keys', { name: 'export test' })
    return created.body.key as string
  }

  it('gives purchases as a CSV download, with formulas escaped', async () => {
    const res = await get('/api/v1/export/purchases.csv', samKey)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="kept-purchases-\d{4}-\d{2}-\d{2}\.csv"$/)
    const rows = res.body.replace('﻿', '').trimEnd().split('\r\n')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toMatch(/^2026-10-28,Sephora,80\.00,USD,Car\/Fuel,,,yes,,/)
    expect(rows[2]).toMatch(/^2026-10-27,'=Shell,60\.00,USD,Car\/Fuel,,Kia,no,full tank,/)
  })
})
