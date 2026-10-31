import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inHousehold } from '../../src/db/db.js'
import { addDays, todayIn } from '../../src/domain/dates.js'
import { INVITES_PER_HOUR } from '../../src/domain/throttle.js'
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
  await sam.post('/api/v1/cost-centers', { name: 'Kia', kind: 'Car' })
})
afterAll(() => h.close())

describe('dates', () => {
  it('saves a date said long ago but asks the assistant to check it', async () => {
    const today = todayIn('America/New_York', new Date())
    const old = await sam.post('/api/v1/transactions', { date: addDays(today, -400), amount: 10.79, merchant: 'Old Navy', category: 'Other' })
    expect(old.status).toBe(201)
    expect(old.body.warnings).toEqual([expect.stringContaining('400 days ago')])
    const recent = await sam.post('/api/v1/transactions', { date: today, amount: 3, merchant: 'Bodega', category: 'Other' })
    expect(recent.body.warnings).toBeUndefined()
  })
})

describe('renaming and deleting vocabulary', () => {
  it('renames a cost center everywhere and deletes one only when nothing uses it', async () => {
    const c = client(h, (await newHousehold(h, 'Rename people')).api_key)
    await c.post('/api/v1/cost-centers', { name: 'Iva', kind: 'Child' })
    await c.post('/api/v1/cost-centers', { name: 'Maya', kind: 'Child' })
    const shirt = await c.post('/api/v1/transactions', { amount: 10.79, merchant: 'Old Navy', category: 'Clothing', spent_for: [{ cost_center: 'Iva' }] })

    const blocked = await c.delete('/api/v1/cost-centers?name=Iva')
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.message).toBe('"Iva" is still used by 1 purchase. Move or change those first, or rename it instead.')

    expect((await c.patch('/api/v1/cost-centers', { name: 'iva', new_name: 'Ivy' })).body).toEqual({ name: 'Ivy', kind: 'Child' })
    expect((await c.patch('/api/v1/cost-centers', { name: 'Ivy', kind: 'Kid' })).body).toEqual({ name: 'Ivy', kind: 'Kid' })
    expect((await c.get(`/api/v1/transactions/${shirt.body.transaction.id}`)).body.line_items[0].spent_for).toEqual([{ cost_center: 'Ivy', share: null }])
    expect((await c.patch('/api/v1/cost-centers', { name: 'Ivy', new_name: 'maya' })).status).toBe(409)

    expect((await c.delete('/api/v1/cost-centers?name=Maya')).status).toBe(204)
    expect((await c.get('/api/v1/cost-centers')).body.cost_centers.map((cc: { name: string }) => cc.name)).toEqual(['Ivy'])
  })

  it('moves a category with its subcategories and watched groups, and deletes only an unused one', async () => {
    const c = client(h, (await newHousehold(h, 'Rename categories')).api_key)
    await c.post('/api/v1/categories', { path: 'Groceries/Alcohol' })
    await c.post('/api/v1/watches', { category: 'groceries/alcohol' })
    const shop = await c.post('/api/v1/transactions', { amount: 30, merchant: 'Kroger', category: 'Groceries', checked_groups: ['Groceries/Alcohol'] })

    expect((await c.patch('/api/v1/categories', { path: 'groceries', new_path: 'Food' })).body).toEqual({ path: 'Food' })
    const paths = (await c.get('/api/v1/categories')).body.categories.map((cat: { path: string }) => cat.path)
    expect(paths).toEqual(expect.arrayContaining(['Food', 'Food/Alcohol']))
    expect(paths).not.toContain('Groceries')
    const moved = (await c.get(`/api/v1/transactions/${shop.body.transaction.id}`)).body
    expect(moved).toMatchObject({ checked_groups: ['Food/Alcohol'], line_items: [{ category: 'Food' }] })
    expect((await c.get('/api/v1/watches')).body.watches).toMatchObject([{ category: 'Food/Alcohol', group: 'Food/Alcohol' }])

    expect((await c.delete('/api/v1/categories?path=Food')).body.error.message).toContain('1 purchase, 1 subcategory')
    expect((await c.delete('/api/v1/categories?path=Food/Alcohol')).body.error.message).toContain('1 watched group')
    expect((await c.patch('/api/v1/categories', { path: 'Food', new_path: 'Travel' })).status).toBe(409)
    expect((await c.delete('/api/v1/categories?path=Travel')).status).toBe(204)
  })
})

describe('repeats', () => {
  it('registers the next occurrence and announces it', async () => {
    const phone = await sam.post('/api/v1/transactions', { date: '2026-09-27', amount: 50, merchant: 'Verizon', category: 'Phone' })
    const repeat = await sam.post('/api/v1/repeats', { transaction_id: phone.body.transaction.id, frequency: 'monthly' })
    expect(repeat.body).toMatchObject({ next_date: '2026-10-27', amount: 50, merchant: 'Verizon', category: 'Phone' })

    expect(await runDueRepeats(h.db, new Date('2026-10-27T03:00:00Z'))).toBe(0) // still Oct 26 in New York
    expect(await runDueRepeats(h.db, new Date('2026-10-27T15:00:00Z'))).toBe(1)
    expect(await runDueRepeats(h.db, new Date('2026-10-27T16:00:00Z'))).toBe(0)

    const updates = (await sam.get('/api/v1/updates')).body.updates
    expect(updates).toEqual([expect.objectContaining({ kind: 'repeat_registered', text: 'Logged your recurring Verizon bill, $50.00.' })])
    const created = (await sam.get(`/api/v1/transactions/${updates[0].transaction_id}`)).body
    expect(created).toMatchObject({ date: '2026-10-27', amount: 50, repeat_id: repeat.body.id })
    expect((await sam.get('/api/v1/repeats')).body.repeats[0].next_date).toBe('2026-11-27')
    expect((await sam.get('/api/v1/repeats')).body).toMatchObject({ repeats: [{ last: { amount: 50 } }], month: { to_come: expect.any(Number) } })

    expect((await sam.post('/api/v1/updates/seen', { ids: [updates[0].id] })).body.marked).toBe(1)
    expect((await sam.get('/api/v1/updates')).body.updates).toEqual([])

    const missing = await sam.post(`/api/v1/repeats/${repeat.body.id}/missing`, { period: 'October' })
    expect(missing.body.text).toBe('No Verizon charge on your October statement. Did you cancel it?')
    expect((await sam.get('/api/v1/questions')).body.questions).toContainEqual(expect.objectContaining({ id: missing.body.id, kind: 'missing_charge' }))
    expect((await sam.post(`/api/v1/questions/${missing.body.id}/answer`, { answer: 'still_paying' })).status).toBe(204)
    expect((await sam.get('/api/v1/questions')).body.questions.some((q: { id: string }) => q.id === missing.body.id)).toBe(false)
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

describe('listing purchases', () => {
  it('filters by several categories and people, searches, pages, and totals everything that matches', async () => {
    const c = client(h, (await newHousehold(h, 'Lists')).api_key)
    await c.post('/api/v1/categories', { path: 'Groceries/Alcohol' })
    await c.post('/api/v1/cost-centers', { name: 'Kia', kind: 'Car' })
    await c.post('/api/v1/transactions', { date: '2026-10-01', amount: 40, merchant: 'Shell', category: 'Car', spent_for: [{ cost_center: 'Kia' }] })
    await c.post('/api/v1/transactions', { date: '2026-10-02', amount: 30, merchant: 'Kroger', category: 'Groceries', line_items: [{ amount: 12, category: 'Groceries/Alcohol', item: 'wine' }] })
    await c.post('/api/v1/transactions', { date: '2026-10-03', amount: 20, merchant: 'Sephora', category: 'Other', private: true })
    const list = async (q: string) => (await c.get(`/api/v1/transactions?${q}`)).body
    const merchants = async (q: string) => (await list(q)).transactions.map((t: { merchant: string }) => t.merchant)

    expect(await list('')).toMatchObject({ count: 3, total: 90 })
    expect(await merchants('category=Car')).toEqual(['Shell'])
    expect(await merchants('category=Car&category=Groceries')).toEqual(['Kroger', 'Shell'])
    expect(await merchants('category_only=Groceries/Alcohol')).toEqual(['Kroger'])
    expect(await merchants('cost_center=kia')).toEqual(['Shell'])
    expect(await merchants('no_cost_center=true')).toEqual(['Sephora', 'Kroger'])
    expect(await merchants('q=wine')).toEqual(['Kroger'])
    expect(await merchants('private=true')).toEqual(['Sephora'])
    const page = await list('limit=2&offset=2')
    expect(page).toMatchObject({ count: 3, total: 90 })
    expect(page.transactions.map((t: { merchant: string }) => t.merchant)).toEqual(['Shell'])
  })
})

describe('watched groups', () => {
  it('watches a category or an item once, and stops', async () => {
    const eatingOut = await sam.post('/api/v1/watches', { category: 'eating out' })
    expect(eatingOut.status).toBe(201)
    expect(eatingOut.body).toMatchObject({ category: 'Eating out', item: null, group: 'Eating out' })
    expect((await sam.post('/api/v1/watches', { category: 'Eating out' })).body.id).toBe(eatingOut.body.id)
    expect((await sam.post('/api/v1/watches', { item: 'snacks' })).body).toMatchObject({ category: null, item: 'snacks' })
    expect((await sam.post('/api/v1/watches', { category: 'Groceries', item: 'snacks' })).body.error.code).toBe('invalid_watch')
    expect((await sam.delete(`/api/v1/watches/${eatingOut.body.id}`)).status).toBe(204)
    expect((await sam.get('/api/v1/watches')).body.watches.map((w: { group: string }) => w.group)).toEqual(['snacks'])
  })
})

describe('notes', () => {
  it('saves, lists newest first, changes and deletes the caller\'s notes', async () => {
    const kia = await sam.post('/api/v1/notes', { text: ' We\'re selling the Kia in December 2026. ' })
    expect(kia.status).toBe(201)
    expect(kia.body.text).toBe('We\'re selling the Kia in December 2026.')
    await sam.post('/api/v1/notes', { text: 'Costco is always groceries.' })
    expect((await sam.get('/api/v1/notes')).body.notes.map((n: { text: string }) => n.text).slice(0, 2)).toEqual(['Costco is always groceries.', 'We\'re selling the Kia in December 2026.'])
    expect((await sam.patch(`/api/v1/notes/${kia.body.id}`, { text: 'Selling the Kia in January 2027.' })).body.text).toBe('Selling the Kia in January 2027.')
    expect((await sam.delete(`/api/v1/notes/${kia.body.id}`)).status).toBe(204)
  })
})

describe('setup and members', () => {
  it('starts with the seed categories and every step pending', async () => {
    const fresh = client(h, (await newHousehold(h, 'New')).api_key)
    const setup = await fresh.get('/api/v1/setup')
    expect(setup.body).toMatchObject({ household: { next_step: 'basics', currency: 'USD' }, you: { introduced: false, role: 'owner' } })
    const categories = (await fresh.get('/api/v1/categories')).body.categories.map((c: { path: string }) => c.path)
    expect(categories).toEqual(['Car', 'Clothing', 'Eating out', 'Groceries', 'Health', 'Housing', 'Other', 'Travel'])

    const patched = await fresh.patch('/api/v1/setup', { currency: 'EUR', timezone: 'Europe/Berlin', steps: { basics: 'done', categories: 'later' }, introduced: true })
    expect(patched.body).toMatchObject({ household: { currency: 'EUR', timezone: 'Europe/Berlin', next_step: 'cost_centers' }, you: { introduced: true } })

    await fresh.post('/api/v1/transactions', { amount: 10, category: 'Other' })
    expect((await fresh.patch('/api/v1/setup', { currency: 'USD' })).body.error.code).toBe('currency_in_use')
  })

  it('lets only owners invite, and an invite works once', async () => {
    const owner = await newHousehold(h, 'Invites')
    const ownerClient = client(h, owner.api_key)
    await ownerClient.post('/api/v1/invites', { email: 'jo@example.com' })
    const token = h.invites.at(-1)!.link.split('#token=')[1]!
    const accept = (name: string) => h.app.inject({ method: 'POST', url: '/api/v1/invites/accept', payload: { token, name } })
    const first = await accept('Jo')
    expect(first.statusCode).toBe(201)
    expect((await accept('Jo again')).statusCode).toBe(410)

    const jo = client(h, first.json().api_key)
    expect((await jo.get('/api/v1/setup')).body.you.role).toBe('member')
    expect((await jo.post('/api/v1/invites', { email: 'kim@example.com' })).status).toBe(403)

    // An email with an account is invited like any other, so the answer doesn't reveal it; the email says it can't join.
    const taken = await ownerClient.post('/api/v1/invites', { email: 'jo@example.com' })
    const fresh = await ownerClient.post('/api/v1/invites', { email: 'lee@example.com' })
    expect(taken.status).toBe(201)
    expect(Object.keys(taken.body).sort()).toEqual(Object.keys(fresh.body).sort())
    expect(h.invites.at(-2)).toEqual({ to: 'jo@example.com', link: '' })
    expect(h.invites.at(-1)!.link).toContain('#token=')
  })

  it('refuses invites past the hourly limit', async () => {
    const created = await newHousehold(h)
    const owner = client(h, created.api_key)
    for (let i = 0; i < INVITES_PER_HOUR; i++) expect((await owner.post('/api/v1/invites', { email: `guest${i}@example.com` })).status).toBe(201)
    const sent = h.invites.length
    const refused = await owner.post('/api/v1/invites', { email: 'one-more@example.com' })
    expect(refused.status).toBe(429)
    expect(refused.body.error.code).toBe('invite_limited')
    expect(h.invites.length).toBe(sent)
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
      '/api/v1/cost-centers', '/api/v1/categories', '/api/v1/watches', '/api/v1/watches/{id}', '/api/v1/notes', '/api/v1/notes/{id}',
      '/api/v1/repeats', '/api/v1/repeats/{id}', '/api/v1/updates', '/api/v1/updates/seen', '/api/v1/setup', '/api/v1/invites',
      '/api/v1/invites/{id}', '/api/v1/invites/accept', '/api/v1/api-keys', '/api/v1/api-keys/{id}', '/api/v1/expenses/summary',
    ]))
  })
})
