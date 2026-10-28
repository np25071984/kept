import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inHousehold } from '../../src/db/db.js'
import { authenticate } from '../../src/ledger/households.js'
import { runDueRepeats, updateRepeat } from '../../src/ledger/repeats.js'
import { client, newHousehold, startHarness, type Harness } from './helpers.js'

let h: Harness
let sam: ReturnType<typeof client>
let samKey: string

beforeAll(async () => {
  h = await startHarness()
  samKey = (await newHousehold(h)).api_key
  sam = client(h, samKey)
  await sam.post('/api/v1/categories', { path: 'Phone' })
  await sam.post('/api/v1/categories', { path: 'Car/Fuel' })
  await sam.post('/api/v1/cost-centers', { name: 'Kia', kind: 'Car', categories: ['Car'] })
})
afterAll(() => h.close())

describe('repeats', () => {
  it('registers the next occurrence and announces it', async () => {
    const phone = await sam.post('/api/v1/transactions', { date: '2026-09-27', amount: 50, merchant: 'Verizon', category: 'Phone' })
    const repeat = await sam.post('/api/v1/repeats', { transaction_id: phone.body.transaction.id, frequency: 'monthly' })
    expect(repeat.body).toMatchObject({ next_date: '2026-10-27', amount: 50, merchant: 'Verizon', category: 'Phone' })

    expect(await runDueRepeats(h.db, new Date('2026-10-27T03:00:00Z'))).toBe(0) // still Oct 26 in New York
    expect(await runDueRepeats(h.db, new Date('2026-10-27T15:00:00Z'))).toBe(1)
    expect(await runDueRepeats(h.db, new Date('2026-10-27T16:00:00Z'))).toBe(0)

    const updates = (await sam.get('/api/v1/updates')).body.updates
    expect(updates).toEqual([expect.objectContaining({ kind: 'repeat_registered', text: 'Registered repeating Verizon expense, $50.00.' })])
    const created = (await sam.get(`/api/v1/transactions/${updates[0].transaction_id}`)).body
    expect(created).toMatchObject({ date: '2026-10-27', amount: 50, repeat_id: repeat.body.id })
    expect((await sam.get('/api/v1/repeats')).body.repeats[0].next_date).toBe('2026-11-27')

    expect((await sam.post('/api/v1/updates/seen', { ids: [updates[0].id] })).body.marked).toBe(1)
    expect((await sam.get('/api/v1/updates')).body.updates).toEqual([])
  })

  it('takes the real amount from the bill and uses it from then on', async () => {
    const repeated = (await sam.get('/api/v1/transactions?merchant=Verizon')).body.transactions.find((t: { repeat_id: string | null; date: string }) => t.date === '2026-10-27')
    const bill = await sam.post('/api/v1/transactions', { date: '2026-10-28', amount: 55, merchant: 'Verizon', category: 'Phone', source: { kind: 'email' } })
    expect(bill.body.result).toBe('attached')
    expect(bill.body.transaction.id).toBe(repeated.id)
    expect((await sam.get('/api/v1/repeats')).body.repeats[0].amount).toBe(55)
  })

  it('pauses, resumes past missed dates, and stops', async () => {
    const id = (await sam.get('/api/v1/repeats')).body.repeats[0].id
    await sam.patch(`/api/v1/repeats/${id}`, { paused: true })
    expect(await runDueRepeats(h.db, new Date('2027-01-15T15:00:00Z'))).toBe(0)
    const caller = (await authenticate(h.db, samKey))!
    const resumed = await inHousehold(h.db, caller.household_id, (tx) => updateRepeat(tx, caller, id, { paused: false }, new Date('2027-01-15T15:00:00Z')))
    expect(resumed).toMatchObject({ paused: false, next_date: '2027-01-27' })
    expect((await sam.delete(`/api/v1/repeats/${id}`)).status).toBe(204)
    // The first bill and the repeated one, with the emailed bill attached to it, stay after the repeat stops.
    expect((await sam.get('/api/v1/transactions?merchant=Verizon')).body.transactions.length).toBe(2)
  })
})

describe('rules', () => {
  it('resolves the most specific rule and hides other members\' personal rules', async () => {
    await sam.post('/api/v1/rules', { kind: 'set_category', merchant: 'Costco', params: { category: 'groceries' }, text: 'Costco is always groceries.' })
    await sam.post('/api/v1/rules', { kind: 'set_spent_for', category: 'Car/Fuel', params: { spent_for: [{ cost_center: 'kia' }] }, text: 'Fuel is for the Kia.' })
    const res = await sam.get('/api/v1/rules?merchant=costco')
    expect(res.body.resolved.set_category).toMatchObject({ params: { category: 'Groceries' } })
    expect(res.body.rules).toHaveLength(1)
    const fuel = await sam.get('/api/v1/rules?category=Car/Fuel')
    expect(fuel.body.resolved.set_spent_for.params.spent_for).toEqual([{ cost_center: 'Kia' }])
  })

  it('rejects bad params', async () => {
    const res = await sam.post('/api/v1/rules', { kind: 'watch', params: {}, text: 'watch something' })
    expect(res.body.error.code).toBe('invalid_rule_params')
  })

  it('deletes a rule', async () => {
    const rule = await sam.post('/api/v1/rules', { kind: 'ask_breakdown', merchant: 'Target', text: 'Target is usually a mix.' })
    expect((await sam.delete(`/api/v1/rules/${rule.body.id}`)).status).toBe(204)
    expect((await sam.get('/api/v1/rules?merchant=Target')).body.rules).toEqual([])
  })
})

describe('notes', () => {
  it('loads notes by link and hides expired ones unless asked', async () => {
    const kia = await sam.post('/api/v1/notes', { text: 'We\'re selling the Kia in December.', cost_centers: ['Kia'], expires_on: '2099-12-31' })
    expect(kia.status).toBe(201)
    await sam.post('/api/v1/notes', { text: 'Groceries were high, we hosted family.', categories: ['Groceries'], expires_on: '2020-01-31' })
    expect((await sam.get('/api/v1/notes?cost_center=kia')).body.notes.map((n: { text: string }) => n.text)).toEqual(['We\'re selling the Kia in December.'])
    expect((await sam.get('/api/v1/notes?category=Groceries')).body.notes).toEqual([])
    expect((await sam.get('/api/v1/notes?category=Groceries&include_expired=true')).body.notes).toHaveLength(1)
    const updated = await sam.patch(`/api/v1/notes/${kia.body.id}`, { text: 'Selling the Kia in January.' })
    expect(updated.body.text).toBe('Selling the Kia in January.')
  })

  it('needs at least one link', async () => {
    expect((await sam.post('/api/v1/notes', { text: 'floating' })).body.error.code).toBe('note_needs_link')
  })
})

describe('setup and members', () => {
  it('starts with the seed categories and every step pending', async () => {
    const fresh = client(h, (await newHousehold(h, 'New')).api_key)
    const setup = await fresh.get('/api/v1/setup')
    expect(setup.body).toMatchObject({ household: { next_step: 'basics', currency: 'USD' }, you: { introduced: false, role: 'owner' } })
    const categories = (await fresh.get('/api/v1/categories')).body.categories.map((c: { path: string }) => c.path)
    expect(categories).toEqual(['Car', 'Clothing', 'Eating out', 'Groceries', 'Health', 'Home', 'Kids', 'Other', 'Travel'])

    const patched = await fresh.patch('/api/v1/setup', { currency: 'EUR', timezone: 'Europe/Berlin', steps: { basics: 'done', categories: 'later' }, introduced: true })
    expect(patched.body).toMatchObject({ household: { currency: 'EUR', next_step: 'cost_centers' }, you: { introduced: true, timezone: 'Europe/Berlin' } })

    await fresh.post('/api/v1/transactions', { amount: 10, category: 'Other' })
    expect((await fresh.patch('/api/v1/setup', { currency: 'USD' })).body.error.code).toBe('currency_in_use')
  })

  it('lets only owners invite, and an invite works once', async () => {
    const owner = await newHousehold(h, 'Invites')
    const ownerClient = client(h, owner.api_key)
    await ownerClient.post('/api/v1/invites', { email: 'jo@example.com' })
    const token = h.invites.at(-1)!.link.split('#token=')[1]!
    const accept = (name: string) => h.app.inject({ method: 'POST', url: '/api/v1/invites/accept', payload: { token, name, timezone: 'UTC' } })
    const first = await accept('Jo')
    expect(first.statusCode).toBe(201)
    expect((await accept('Jo again')).statusCode).toBe(410)

    const jo = client(h, first.json().api_key)
    expect((await jo.get('/api/v1/setup')).body.you.role).toBe('member')
    expect((await jo.post('/api/v1/invites', { email: 'kim@example.com' })).status).toBe(403)
    expect((await ownerClient.post('/api/v1/invites', { email: 'jo@example.com' })).body.error.code).toBe('email_taken')
  })

  it('issues and revokes API keys', async () => {
    const created = await sam.post('/api/v1/api-keys', { name: 'Laptop script' })
    const laptop = client(h, created.body.key)
    expect((await laptop.get('/api/v1/categories')).status).toBe(200)
    expect((await sam.delete(`/api/v1/api-keys/${created.body.id}`)).status).toBe(204)
    expect((await laptop.get('/api/v1/categories')).status).toBe(401)
  })
})

describe('OpenAPI', () => {
  it('describes every endpoint', async () => {
    const spec = (await h.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json()
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining([
      '/api/v1/transactions', '/api/v1/transactions/{id}', '/api/v1/transactions/{id}/sources', '/api/v1/transactions/{id}/merge',
      '/api/v1/cost-centers', '/api/v1/categories', '/api/v1/rules', '/api/v1/rules/{id}', '/api/v1/notes', '/api/v1/notes/{id}',
      '/api/v1/repeats', '/api/v1/repeats/{id}', '/api/v1/updates', '/api/v1/updates/seen', '/api/v1/setup', '/api/v1/invites',
      '/api/v1/invites/{id}', '/api/v1/invites/accept', '/api/v1/api-keys', '/api/v1/api-keys/{id}', '/api/v1/expenses/summary',
    ]))
  })
})
