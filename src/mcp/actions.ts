import { z } from 'zod'
import { Id } from '../api/common.js'
import { CapBody, CostCenterBody, NoteBody, RepeatBody, RepeatPatch, WatchBody } from '../api/ledger.js'

// The merged tools' inputs, built from the REST API's fields, and which REST call each action makes. A tool error names
// the tool's own parameters, since the REST API's message would name its fields instead (IMPLEMENTATION.md §5.1).

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
export type Call = { method: Method; url: string; body?: Record<string, unknown> }
export type Planned = { ok: true; call: Call } | { ok: false; error: { code: string; message: string } }

const call = (method: Method, url: string, body?: Record<string, unknown>): Planned => ({ ok: true, call: { method, url, ...(body && { body }) } })
const missing = (field: string, action: string): Planned => ({ ok: false, error: { code: 'missing_field', message: `${field} is required to ${action}.` } })

// An array becomes the key repeated, as the REST API takes several categories or cost centers.
export function query(params: Record<string, unknown>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((v) => [key, String(v)]))
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : ''
}

// Only the given keys the agent sent; null stays, as it clears a field.
function pick<T extends object>(args: T, keys: (keyof T & string)[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => args[key] !== undefined).map((key) => [key, args[key]]))
}

export const ManageVocabulary = z.object({
  action: z.enum(['add', 'rename', 'delete']),
  what: z.enum(['category', 'cost_center']),
  name: CostCenterBody.shape.name.describe('The category path or the person or thing\'s name; for add, the new one.'),
  new_name: CostCenterBody.shape.name.optional().describe('rename: the new path or name.'),
  kind: CostCenterBody.shape.kind.optional().describe('add cost_center: Car, Home, Child, Pet or anything else.'),
})
export type VocabularyArgs = z.infer<typeof ManageVocabulary>

export function vocabularyCall({ action, what, name, new_name, kind }: VocabularyArgs): Planned {
  const category = what === 'category'
  const url = category ? '/api/v1/categories' : '/api/v1/cost-centers'
  if (action === 'add') {
    if (category) return call('POST', url, { path: name })
    return kind ? call('POST', url, { name, kind }) : missing('kind', 'add a cost center')
  }
  if (action === 'rename') {
    if (!new_name) return missing('new_name', 'rename')
    return call('PATCH', url, category ? { path: name, new_path: new_name } : { name, new_name })
  }
  return call('DELETE', `${url}${query(category ? { path: name } : { name })}`)
}

export const ManageWatches = z.object({ action: z.enum(['start', 'stop']), id: Id.optional().describe('stop: the watched group\'s id.') }).extend(WatchBody.shape)
export type WatchArgs = z.infer<typeof ManageWatches>

export function watchCall(args: WatchArgs): Planned {
  if (args.action === 'start') return call('POST', '/api/v1/watches', pick(args, ['category', 'item']))
  return args.id ? call('DELETE', `/api/v1/watches/${args.id}`) : missing('id', 'stop watching')
}

export const ManageCaps = z.object({ action: z.enum(['set', 'change', 'remove']), id: Id.optional() }).extend(CapBody.partial().shape)
export type CapArgs = z.infer<typeof ManageCaps>

export function capCall(args: CapArgs): Planned {
  if (args.action === 'set') return call('POST', '/api/v1/caps', pick(args, ['category', 'cost_center', 'amount', 'period']))
  if (!args.id) return missing('id', `${args.action} a cap`)
  if (args.action === 'change') return call('PATCH', `/api/v1/caps/${args.id}`, pick(args, ['amount', 'period']))
  return call('DELETE', `/api/v1/caps/${args.id}`)
}

export const ManageNotes = z.object({ action: z.enum(['save', 'update', 'delete']), id: Id.optional(), text: NoteBody.shape.text.optional() })
export type NoteArgs = z.infer<typeof ManageNotes>

export function noteCall({ action, id, text }: NoteArgs): Planned {
  if (action !== 'delete' && !text) return missing('text', `${action} a note`)
  if (action === 'save') return call('POST', '/api/v1/notes', { text })
  if (!id) return missing('id', `${action} a note`)
  return action === 'update' ? call('PATCH', `/api/v1/notes/${id}`, { text }) : call('DELETE', `/api/v1/notes/${id}`)
}

export const ManageRepeats = z.object({ action: z.enum(['set', 'list', 'update', 'stop']), id: Id.optional().describe('update, stop: the repeat\'s id.') })
  .extend(RepeatBody.partial().shape)
  .extend(RepeatPatch.shape)
  .extend({
    transaction_id: RepeatBody.shape.transaction_id.optional().describe('set: the purchase to repeat.'),
    amount: RepeatPatch.shape.amount.describe('update: the amount from the next date.'),
    paused: RepeatPatch.shape.paused.describe('update: pause or resume.'),
  })
export type RepeatArgs = z.infer<typeof ManageRepeats>

const SCHEDULE: (keyof RepeatArgs)[] = ['frequency', 'interval', 'anchor', 'ends_on', 'remaining']

export function repeatCall(args: RepeatArgs): Planned {
  if (args.action === 'list') return call('GET', '/api/v1/repeats')
  if (args.action === 'set') {
    return args.transaction_id ? call('POST', '/api/v1/repeats', pick(args, ['transaction_id', ...SCHEDULE])) : missing('transaction_id', 'set a repeat')
  }
  if (!args.id) return missing('id', `${args.action} a repeat`)
  if (args.action === 'update') return call('PATCH', `/api/v1/repeats/${args.id}`, pick(args, ['amount', ...SCHEDULE, 'paused']))
  return call('DELETE', `/api/v1/repeats/${args.id}`)
}