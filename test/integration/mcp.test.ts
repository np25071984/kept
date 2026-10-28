import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newHousehold, startHarness, type Harness } from './helpers.js'

let h: Harness
let url: URL
let key: string

async function connect(apiKey: string) {
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${apiKey}` } } }))
  return client
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as { type: string; text: string }[])[0]!.text
  return { isError: result.isError === true, body: JSON.parse(text) }
}

beforeAll(async () => {
  h = await startHarness()
  const address = await h.app.listen({ port: 0, host: '127.0.0.1' })
  url = new URL(`${address}/mcp`)
  key = (await newHousehold(h)).api_key
})
afterAll(() => h.close())

describe('MCP server', () => {
  it('refuses a connection without a valid key', async () => {
    await expect(connect('kept_nope')).rejects.toThrow()
  })

  it('sends the playbook as instructions and lists every tool, prompt and resource', async () => {
    const client = await connect(key)
    expect(client.getInstructions()).toContain('Call get_playbook before the first question about money')
    const tools = (await client.listTools()).tools.map((t) => t.name).sort()
    expect(tools).toEqual([
      'add_category', 'add_cost_center', 'add_source', 'delete_note', 'delete_rule', 'delete_transaction', 'edit_transaction', 'get_notes',
      'get_playbook', 'get_rules', 'get_summary', 'get_updates', 'invite_member', 'list_cost_centers', 'list_repeats', 'list_transactions',
      'log_transaction', 'merge_transactions', 'save_note', 'save_rule', 'set_repeat', 'stop_repeat', 'update_note', 'update_repeat', 'update_setup',
    ])
    expect((await client.listPrompts()).prompts.map((p) => p.name).sort()).toEqual(['catch_up', 'log_expense', 'setup_household'])
    const resource = await client.readResource({ uri: 'kept://household' })
    expect(JSON.parse((resource.contents[0] as { text: string }).text).categories).toContain('Groceries')
    await client.close()
  })

  it('starts a new owner with the first conversation, then moves on', async () => {
    const client = await connect(key)
    const first = await call(client, 'get_playbook')
    expect(first.body.start_with).toContain('First conversation: setting up a new household')
    expect(first.body.playbook).toContain('## Logging an expense')

    await call(client, 'update_setup', { introduced: true, steps: { basics: 'done', cost_centers: 'done' } })
    expect((await call(client, 'get_playbook')).body.start_with).toContain('offer to continue setup at "categories"')
    await call(client, 'update_setup', { steps: { categories: 'later', watch: 'later', invite: 'later' } })
    expect((await call(client, 'get_playbook')).body.start_with).toBe('Setup is done. Handle the user\'s request.')
    await client.close()
  })

  it('runs the fuel conversation\'s tool calls end to end', async () => {
    const client = await connect(key)
    expect((await call(client, 'add_category', { path: 'Car/Fuel' })).isError).toBe(false)
    await call(client, 'add_cost_center', { name: 'Hyundai', kind: 'Car', categories: ['Car'] })
    await call(client, 'add_cost_center', { name: 'Kia', kind: 'Car', categories: ['Car'] })

    const cars = await call(client, 'list_cost_centers', { category: 'Car/Fuel' })
    expect(cars.body.cost_centers.map((c: { name: string }) => c.name)).toEqual(['Hyundai', 'Kia'])

    const logged = await call(client, 'log_transaction', { transactions: [{ amount: 60, date: '2026-10-27', merchant: 'Shell', category: 'Car/Fuel', spent_for: [{ cost_center: 'Kia' }] }] })
    expect(logged.body.results[0]).toMatchObject({ result: 'created', transaction: { amount: 60, category: 'Car/Fuel' } })

    const charge = await call(client, 'log_transaction', { transactions: [{ amount: 61.2, date: '2026-10-28', merchant: 'SHELL OIL 57444', category: 'Other', source: { kind: 'statement' } }] })
    expect(charge.body.results[0]).toMatchObject({ result: 'attached', transaction: { amount: 61.2, merchant: 'Shell' } })

    const listed = await call(client, 'list_transactions', { merchant: 'Shell' })
    expect(listed.body.transactions).toHaveLength(1)
    await client.close()
  })

  it('returns ledger errors as tool errors the agent can read', async () => {
    const client = await connect(key)
    const wrong = await call(client, 'log_transaction', { transactions: [{ amount: 5, category: 'Gas' }] })
    expect(wrong.isError).toBe(true)
    expect(wrong.body.error).toMatchObject({ code: 'unknown_category', details: { known: expect.arrayContaining(['Car/Fuel']) } })
    await client.close()
  })

  it('announces updates once', async () => {
    const client = await connect(key)
    await call(client, 'log_transaction', { transactions: [{ amount: 41.12, date: '2026-10-27', category: 'Other', source: { kind: 'statement' } }] })
    await call(client, 'log_transaction', { transactions: [{ amount: 40, date: '2026-10-26', merchant: 'Target', category: 'Groceries' }] })
    const first = await call(client, 'get_updates')
    expect(first.body.updates.length).toBe(1)
    expect((await call(client, 'get_updates')).body.updates).toEqual([])
    await client.close()
  })
})
