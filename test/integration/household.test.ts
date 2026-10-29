import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inHousehold } from '../../src/db/db.js'
import { client, newHousehold, startHarness, type Harness } from './helpers.js'

// Phase 1 gate: two users in one household log, edit, match, merge and summarize, and neither reads the other's purchases.
describe('two members of one household', () => {
  let h: Harness
  let sam: ReturnType<typeof client>
  let alex: ReturnType<typeof client>
  let householdId: string

  beforeAll(async () => {
    h = await startHarness()
    const created = await newHousehold(h)
    householdId = created.household_id
    sam = client(h, created.api_key)

    await sam.post('/api/v1/categories', { path: 'Car/Fuel' })
    await sam.post('/api/v1/categories', { path: 'Car/Insurance' })
    await sam.post('/api/v1/categories', { path: 'Groceries/Alcohol' })
    await sam.post('/api/v1/cost-centers', { name: 'Hyundai', kind: 'Car' })
    await sam.post('/api/v1/cost-centers', { name: 'Kia', kind: 'Car' })
    await sam.post('/api/v1/cost-centers', { name: 'Zoe', kind: 'Child' })

    const invite = await sam.post('/api/v1/invites', { email: 'alex@example.com' })
    expect(invite.status).toBe(201)
    const token = h.invites[0]!.link.split('#token=')[1]!
    const accepted = await h.app.inject({ method: 'POST', url: '/api/v1/invites/accept', payload: { token, name: 'Alex' } })
    expect(accepted.statusCode).toBe(201)
    alex = client(h, accepted.json().api_key)
  })
  afterAll(() => h.close())

  it('rejects requests without a valid key', async () => {
    expect((await client(h, 'kept_nope').get('/api/v1/transactions')).status).toBe(401)
    expect((await h.app.inject({ method: 'GET', url: '/api/v1/transactions' })).statusCode).toBe(401)
  })

  it('logs the fuel example with the shorthand', async () => {
    const res = await sam.post('/api/v1/transactions', { date: '2026-10-27', timezone: 'America/New_York', amount: 60, category: 'Car/Fuel', spent_for: [{ cost_center: 'kia' }], merchant: 'Shell' })
    expect(res.status).toBe(201)
    expect(res.body.result).toBe('created')
    expect(res.body.transaction.line_items).toEqual([{ amount: 60, category: 'Car/Fuel', item: null, notes: null, rest: true, spent_for: [{ cost_center: 'Kia', share: null }] }])
  })

  it('refuses an unknown cost center and names the likely one', async () => {
    const res = await sam.post('/api/v1/transactions', { amount: 12, category: 'Car/Fuel', spent_for: [{ cost_center: 'Kai' }] })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatchObject({ code: 'unknown_cost_center', details: { similar: ['Kia'] } })
    expect(res.body.error.message).toContain('meant "Kia"')
  })

  it('adds the rest line to a mixed purchase', async () => {
    const res = await sam.post('/api/v1/transactions', {
      date: '2026-10-26', amount: 40, merchant: 'Target', category: 'Groceries',
      line_items: [{ amount: 22, category: 'Clothing', item: 'shoes', spent_for: [{ cost_center: 'Zoe' }] }, { amount: 12, category: 'Housing', item: 'bath curtains' }],
    })
    expect(res.body.transaction.line_items.map((l: { amount: number; category: string; rest: boolean }) => [l.amount, l.category, l.rest])).toEqual([[22, 'Clothing', false], [12, 'Housing', false], [6, 'Groceries', true]])
  })

  it('rejects unknown categories and line items over the total', async () => {
    const unknown = await sam.post('/api/v1/transactions', { amount: 5, category: 'Gas' })
    expect(unknown.status).toBe(422)
    expect(unknown.body.error.code).toBe('unknown_category')
    const over = await sam.post('/api/v1/transactions', { amount: 5, category: 'Groceries', line_items: [{ amount: 6, category: 'Housing' }] })
    expect(over.body.error.code).toBe('line_items_exceed_amount')
    const shares = await sam.post('/api/v1/transactions', { amount: 900, category: 'Car/Insurance', spent_for: [{ cost_center: 'Hyundai', share: 0.7 }, { cost_center: 'Kia', share: 0.4 }] })
    expect(shares.body.error.code).toBe('shares_exceed_one')
  })

  it('attaches the card charge to the purchase the user mentioned', async () => {
    const res = await sam.post('/api/v1/transactions', { date: '2026-10-28', amount: 61.2, merchant: 'SHELL OIL 57444', category: 'Other', source: { kind: 'statement' } })
    expect(res.body.result).toBe('attached')
    expect(res.body.transaction.amount).toBe(61.2)
    expect(res.body.transaction.merchant).toBe('Shell')
    expect(res.body.transaction.line_items[0]).toMatchObject({ category: 'Car/Fuel', amount: 61.2 })
    expect(res.body.changes.map((c: { field: string }) => c.field).sort()).toEqual(['amount', 'date'])
    expect(res.body.transaction.sources.map((s: { kind: string }) => s.kind)).toEqual(['talk', 'statement'])
  })

  it('flags an unclear match and merges it on request', async () => {
    const res = await sam.post('/api/v1/transactions', { date: '2026-10-27', amount: 41.12, category: 'Other', source: { kind: 'statement' } })
    expect(res.body.result).toBe('possible_duplicate')
    const updates = await sam.get('/api/v1/updates')
    expect(updates.body.updates).toEqual([expect.objectContaining({ kind: 'possible_duplicate', transaction_id: res.body.transaction.id })])
    expect((await sam.get('/api/v1/questions')).body.questions).toEqual([expect.objectContaining({ kind: 'duplicate', later: expect.objectContaining({ id: res.body.transaction.id }) })])

    const target = updates.body.updates[0].other_transaction_id
    const merged = await sam.post(`/api/v1/transactions/${target}/merge`, { other_id: res.body.transaction.id })
    expect(merged.status).toBe(200)
    expect(merged.body.transaction.amount).toBe(41.12)
    expect(merged.body.transaction.line_items.find((l: { rest: boolean }) => l.rest).amount).toBe(7.12)
    expect((await sam.get(`/api/v1/transactions/${res.body.transaction.id}`)).status).toBe(404)
    expect((await sam.get('/api/v1/updates')).body.updates).toEqual([])
  })

  it('keeps the user\'s own edit when the charge arrives later', async () => {
    const logged = await sam.post('/api/v1/transactions', { date: '2026-10-20', amount: 40, merchant: 'Old Navy', category: 'Clothing' })
    await sam.patch(`/api/v1/transactions/${logged.body.transaction.id}`, { amount: 18 })
    const charge = await sam.post('/api/v1/transactions', { date: '2026-10-21', amount: 40, merchant: 'OLD NAVY 0042', category: 'Other', source: { kind: 'statement' } })
    expect(charge.body.result).toBe('attached')
    expect(charge.body.transaction.amount).toBe(18)
    expect(charge.body.kept).toEqual([expect.objectContaining({ field: 'amount', reason: 'user_edit' })])
  })

  it('never shows one member\'s purchases to another', async () => {
    await alex.post('/api/v1/transactions', { date: '2026-10-27', amount: 60, merchant: 'Shell', category: 'Car/Fuel', spent_for: [{ cost_center: 'Hyundai' }] })
    const samList = (await sam.get('/api/v1/transactions')).body.transactions
    const alexList = (await alex.get('/api/v1/transactions')).body.transactions
    expect(alexList).toHaveLength(1)
    expect(samList.some((t: { id: string }) => t.id === alexList[0].id)).toBe(false)
    expect((await sam.get(`/api/v1/transactions/${alexList[0].id}`)).status).toBe(404)
    expect((await sam.patch(`/api/v1/transactions/${alexList[0].id}`, { amount: 1 })).status).toBe(404)
    expect((await sam.delete(`/api/v1/transactions/${alexList[0].id}`)).status).toBe(404)
  })

  it('leaves private purchases out of household totals but not the owner\'s', async () => {
    const gift = await alex.post('/api/v1/transactions', { date: '2026-10-25', amount: 80, merchant: 'Sephora', category: 'Other', private: true })
    expect(gift.body.transaction.private).toBe(true)

    const household = await sam.get('/api/v1/expenses/summary?from=2026-10-01&to=2026-10-31&scope=household')
    const mine = await alex.get('/api/v1/expenses/summary?from=2026-10-01&to=2026-10-31&scope=me')
    const total = (rows: { key: string; amount: number }[], key: string) => rows.find((r) => r.key === key)?.amount
    expect(total(household.body.totals, 'Other')).toBeUndefined()
    expect(total(mine.body.totals, 'Other')).toBe(80)
    // Fuel rolls up into Car, and the household total adds both members' fuel.
    expect(total(household.body.totals, 'Car')).toBe(121.2)
    expect(JSON.stringify(household.body)).not.toContain('Alex')
  })

  it('lets each member rename themselves and only an owner rename the household', async () => {
    const renamed = await alex.patch('/api/v1/me', { name: 'Alexandra' })
    expect(renamed.body.you.name).toBe('Alexandra')
    expect((await alex.patch('/api/v1/setup', { name: 'Alex\'s place' })).status).toBe(403)
    expect((await sam.get('/api/v1/setup')).body.household.currency_locked).toBe(true)
  })

  it('shares one time zone that only an owner changes', async () => {
    expect((await alex.get('/api/v1/setup')).body.household.timezone).toBe('America/New_York')
    expect((await alex.patch('/api/v1/setup', { timezone: 'Europe/Berlin' })).status).toBe(403)
    expect((await sam.patch('/api/v1/setup', { timezone: 'nowhere' })).status).toBe(422)
  })

  it('tracks a member\'s caps and says when a purchase passes 80% or the cap', async () => {
    const cap = await alex.post('/api/v1/caps', { category: 'Eating out', amount: 100, period: 'month' })
    expect(cap.status).toBe(201)
    const first = await alex.post('/api/v1/transactions', { amount: 85, merchant: 'Chipotle', category: 'Eating out' })
    expect(first.body.caps).toEqual(['That\'s $85.00 of the $100.00 Eating out cap this month.'])
    const second = await alex.post('/api/v1/transactions', { amount: 30, merchant: 'Chipotle', category: 'Eating out' })
    expect(second.body.caps).toEqual(['That puts Eating out $15.00 over the cap this month.'])
    expect((await alex.get('/api/v1/caps')).body.caps).toMatchObject([{ spent: 115, state: 'over' }])
    const question = (await alex.get('/api/v1/questions')).body.questions.find((q: { kind: string }) => q.kind === 'cap')
    expect(question).toMatchObject({ cap: { name: 'Eating out', spent: 115 } })
    expect((await alex.post(`/api/v1/questions/${question.id}/answer`, { answer: 'merge' })).status).toBe(422)
    expect((await alex.post(`/api/v1/questions/${question.id}/answer`, { answer: 'keep' })).status).toBe(204)
    expect((await alex.get('/api/v1/questions')).body.questions.filter((q: { kind: string }) => q.kind === 'cap')).toEqual([])
    expect((await sam.get('/api/v1/caps')).body.caps).toEqual([])
    expect((await sam.delete(`/api/v1/caps/${cap.body.id}`)).status).toBe(404)
  })

  it('keeps each member\'s notes and watched groups to themselves', async () => {
    const note = await alex.post('/api/v1/notes', { text: 'Anything at Sephora is private.' })
    const watch = await alex.post('/api/v1/watches', { item: 'makeup' })
    expect((await sam.get('/api/v1/notes')).body.notes.map((n: { id: string }) => n.id)).not.toContain(note.body.id)
    expect((await sam.patch(`/api/v1/notes/${note.body.id}`, { text: 'x' })).status).toBe(404)
    expect((await sam.delete(`/api/v1/notes/${note.body.id}`)).status).toBe(404)
    expect((await sam.get('/api/v1/watches')).body.watches.map((w: { id: string }) => w.id)).not.toContain(watch.body.id)
    expect((await sam.delete(`/api/v1/watches/${watch.body.id}`)).status).toBe(404)
  })

  it('splits shared cost centers in reports by their shares', async () => {
    await sam.post('/api/v1/transactions', { date: '2026-10-10', amount: 900, category: 'Car/Insurance', merchant: 'Geico', spent_for: [{ cost_center: 'Hyundai', share: 0.58 }, { cost_center: 'Kia' }] })
    const summary = await sam.get('/api/v1/expenses/summary?from=2026-10-01&to=2026-10-31&group_by=cost_center')
    const byCar = Object.fromEntries(summary.body.totals.map((r: { key: string; amount: number }) => [r.key, r.amount]))
    expect(byCar.Hyundai).toBe(522)
    expect(byCar.Kia).toBe(378 + 61.2)
  })

  it('reports watched-group coverage', async () => {
    await sam.post('/api/v1/watches', { category: 'Groceries/Alcohol' })
    await sam.post('/api/v1/transactions', { date: '2026-10-05', amount: 95, merchant: 'Whole Foods', category: 'Groceries', line_items: [{ amount: 20, category: 'Groceries/Alcohol', item: 'wine' }] })
    await sam.post('/api/v1/transactions', { date: '2026-10-06', amount: 50, merchant: 'Trader Joe\'s', category: 'Groceries' })
    const summary = await sam.get('/api/v1/expenses/summary?from=2026-10-01&to=2026-10-31')
    const alcohol = summary.body.watched.find((w: { group: string }) => w.group === 'Groceries/Alcohol')
    // Checked: the $95 Whole Foods run. Unchecked: Trader Joe's, and Target's $7.12 of groceries after its card charge.
    expect(alcohol.total).toBe(20)
    expect(alcohol.checked_share).toBe(Math.round((95 / 152.12) * 1000) / 1000)
    expect(alcohol.estimate).toBe(32.03)
  })

  it('isolates households in the database itself', async () => {
    const other = await newHousehold(h, 'The Joneses')
    const jones = client(h, other.api_key)
    await jones.post('/api/v1/transactions', { amount: 12, category: 'Groceries' })

    // A query with no household filter at all, as kept_app inside Sam's household, sees only Sam's household.
    const rows = await inHousehold(h.db, householdId, (tx) => sql<{ household_id: string }>`select household_id from transactions`.execute(tx))
    expect(rows.rows.length).toBeGreaterThan(0)
    expect(rows.rows.every((r) => r.household_id === householdId)).toBe(true)
    // Without a household set, kept_app sees nothing.
    expect((await sql`select id from transactions`.execute(h.db)).rows).toEqual([])
    expect((await jones.get('/api/v1/categories')).body.categories.some((c: { path: string }) => c.path === 'Car/Fuel')).toBe(false)
  })
})
