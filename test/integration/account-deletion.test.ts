import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { client, newHousehold, startHarness, type Harness } from './helpers.js'

describe('deleting your own account', () => {
  let h: Harness
  let sam: ReturnType<typeof client>
  let alex: ReturnType<typeof client>
  let householdId: string
  let alexId: string

  const deleteMe = async (key: string, email: string) => (await h.app.inject({ method: 'DELETE', url: '/api/v1/me', headers: { authorization: `Bearer ${key}` }, payload: { confirm_email: email } })).statusCode
  let samKey: string
  let alexKey: string

  beforeAll(async () => {
    h = await startHarness()
    const household = await newHousehold(h, 'The Smiths', 'sam@example.com')
    householdId = household.household_id
    samKey = household.api_key
    sam = client(h, samKey)
    await sam.post('/api/v1/invites', { email: 'alex@example.com' })
    const token = h.invites[0]!.link.split('#token=')[1]!
    const accepted = await h.app.inject({ method: 'POST', url: '/api/v1/invites/accept', payload: { token, name: 'Alex' } })
    alexKey = accepted.json().api_key
    alex = client(h, alexKey)
    alexId = (await sam.get('/api/v1/members')).body.members[1].id
    await alex.post('/api/v1/transactions', { amount: 60, merchant: 'Shell', category: 'Car' })
    await sam.post('/api/v1/transactions', { amount: 40, merchant: 'Target', category: 'Clothing' })
  })
  afterAll(() => h.close())

  it('needs the account\'s email', async () => {
    expect(await deleteMe(alexKey, 'sam@example.com')).toBe(422)
    expect((await alex.get('/api/v1/transactions')).status).toBe(200)
  })

  it('makes the only owner hand over first', async () => {
    expect(await deleteMe(samKey, 'sam@example.com')).toBe(409)
    expect((await sam.get('/api/v1/transactions')).status).toBe(200)
  })

  it('removes a member, their sign-ins and their purchases from household totals', async () => {
    await sql`INSERT INTO oauth_models (name, id, payload) VALUES ('Grant', 'alex-grant', ${JSON.stringify({ accountId: alexId })}::jsonb), ('Grant', 'sam-grant', ${JSON.stringify({ accountId: 'someone-else' })}::jsonb)`.execute(h.owner)
    expect(await deleteMe(alexKey, 'ALEX@example.com')).toBe(204)
    expect((await alex.get('/api/v1/transactions')).status).toBe(401)
    const grants = await sql<{ id: string }>`SELECT id FROM oauth_models WHERE name = 'Grant'`.execute(h.owner)
    expect(grants.rows.map((g) => g.id)).toEqual(['sam-grant'])
    const totals = await sam.get('/api/v1/expenses/summary?scope=household&period=total')
    expect(totals.body.totals.map((t: { key: string }) => t.key)).toEqual(['Clothing'])
    const left = await sql<{ n: number }>`SELECT count(*)::int AS n FROM transactions WHERE household_id = ${householdId}`.execute(h.owner)
    expect(left.rows[0]!.n).toBe(1)
  })

  it('takes the household with its only member', async () => {
    expect(await deleteMe(samKey, 'sam@example.com')).toBe(204)
    expect((await sam.get('/api/v1/transactions')).status).toBe(401)
    for (const table of ['households', 'users', 'transactions', 'categories']) {
      const rows = await sql<{ n: number }>`SELECT count(*)::int AS n FROM ${sql.table(table)}`.execute(h.owner)
      expect([table, rows.rows[0]!.n]).toEqual([table, 0])
    }
  })
})
