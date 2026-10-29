import { deleteNote, getNotes, saveNote, updateNote } from '../../ledger/notes.js'
import { createRepeat, listRepeats, stopRepeat, updateRepeat } from '../../ledger/repeats.js'
import { deleteRule, getRules, saveRule } from '../../ledger/rules.js'
import { getSummary } from '../../ledger/summary.js'
import { getUpdates, markSeen } from '../../ledger/updates.js'
import { addCategory, addCostCenter, deleteCategory, deleteCostCenter, listCategories, listCostCenters, renameCategory, updateCostCenter } from '../../ledger/vocabulary.js'
import type { App, RouteDeps } from '../app.js'
import {
  CategoryBody, CategoryQuery, CategoryRename, CostCenterBody, CostCenterName, CostCenterQuery, CostCenterPatch, IdParams, NoteBody, NotePatch, NoteQuery, RepeatBody, RepeatPatch, RuleBody, RuleQuery,
  SeenBody, SummaryQuery, UpdatesQuery,
} from '../schemas.js'

export function ledgerRoutes(app: App, { run }: RouteDeps) {
  app.get('/api/v1/categories', {
    schema: { tags: ['vocabulary'], summary: 'The household\'s categories and subcategories.' },
  }, async (request) => ({ categories: await run(request, (tx) => listCategories(tx)) }))

  app.post('/api/v1/categories', {
    schema: { tags: ['vocabulary'], summary: 'Add a category or subcategory. A subcategory\'s parent must exist.', body: CategoryBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => addCategory(tx, caller, request.body.path))
  })

  app.patch('/api/v1/categories', {
    schema: { tags: ['vocabulary'], summary: 'Rename or move a category. Purchases, rules, notes and repeats keep pointing at it.', body: CategoryRename },
  }, async (request) => run(request, (tx) => renameCategory(tx, request.body.path, request.body.new_path)))

  app.delete('/api/v1/categories', {
    schema: { tags: ['vocabulary'], summary: 'Delete a category nothing uses: no purchases, subcategories, rules, notes or repeats.', querystring: CategoryQuery },
  }, async (request, reply) => {
    await run(request, (tx) => deleteCategory(tx, request.query.path))
    return reply.status(204).send()
  })

  app.get('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'The household\'s cost centers, optionally those linked to a category or its parent.', querystring: CostCenterQuery },
  }, async (request) => ({ cost_centers: await run(request, (tx) => listCostCenters(tx, request.query.category)) }))

  app.post('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'Add a cost center, optionally linked to categories.', body: CostCenterBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => addCostCenter(tx, caller, request.body))
  })

  app.patch('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'Rename a cost center, change its kind or the categories it is linked to. Purchases, rules, notes and repeats keep pointing at it.', body: CostCenterPatch },
  }, async (request) => {
    const { name, ...patch } = request.body
    return run(request, (tx, caller) => updateCostCenter(tx, caller, name, patch))
  })

  app.delete('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'Delete a cost center nothing uses: no purchases, rules, notes or repeats.', querystring: CostCenterName },
  }, async (request, reply) => {
    await run(request, (tx) => deleteCostCenter(tx, request.query.name))
    return reply.status(204).send()
  })

  app.get('/api/v1/rules', {
    schema: { tags: ['rules'], summary: 'Household-wide and the caller\'s personal rules. With filters, only matching rules plus the one that wins for each kind.', querystring: RuleQuery },
  }, async (request) => run(request, (tx, caller) => getRules(tx, caller, request.query)))

  app.post('/api/v1/rules', {
    schema: { tags: ['rules'], summary: 'Save a rule the user confirmed. set_private rules are always personal.', body: RuleBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => saveRule(tx, caller, request.body))
  })

  app.delete('/api/v1/rules/:id', {
    schema: { tags: ['rules'], summary: 'Remove a rule. Past transactions are not changed.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => deleteRule(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.get('/api/v1/notes', {
    schema: { tags: ['notes'], summary: 'Notes linked to any of the given cost center, category or merchant, or matching q. Expired notes only on request.', querystring: NoteQuery },
  }, async (request) => ({ notes: await run(request, (tx, caller) => getNotes(tx, caller, request.query)) }))

  app.post('/api/v1/notes', {
    schema: { tags: ['notes'], summary: 'Save a note linked to at least one cost center, category or merchant.', body: NoteBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => saveNote(tx, caller, request.body))
  })

  app.patch('/api/v1/notes/:id', {
    schema: { tags: ['notes'], summary: 'Change a note\'s text, links or expiry.', params: IdParams, body: NotePatch },
  }, async (request) => run(request, (tx, caller) => updateNote(tx, caller, request.params.id, request.body)))

  app.delete('/api/v1/notes/:id', {
    schema: { tags: ['notes'], summary: 'Delete a note.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => deleteNote(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.get('/api/v1/repeats', {
    schema: { tags: ['repeats'], summary: 'The caller\'s repeats with their next date and amount.' },
  }, async (request) => ({ repeats: await run(request, (tx, caller) => listRepeats(tx, caller)) }))

  app.post('/api/v1/repeats', {
    schema: { tags: ['repeats'], summary: 'Make a transaction repeat. It is the first occurrence.', body: RepeatBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => createRepeat(tx, caller, request.body))
  })

  app.patch('/api/v1/repeats/:id', {
    schema: { tags: ['repeats'], summary: 'Change the amount, schedule or end from the next occurrence, or pause and resume.', params: IdParams, body: RepeatPatch },
  }, async (request) => run(request, (tx, caller) => updateRepeat(tx, caller, request.params.id, request.body)))

  app.delete('/api/v1/repeats/:id', {
    schema: { tags: ['repeats'], summary: 'Stop repeating. Transactions already created are kept.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => stopRepeat(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.get('/api/v1/updates', {
    schema: { tags: ['updates'], summary: 'What the ledger did on its own that the caller hasn\'t seen: repeats registered and possible duplicates.', querystring: UpdatesQuery },
  }, async (request) => ({ updates: await run(request, (tx, caller) => getUpdates(tx, caller, request.query.all)) }))

  app.post('/api/v1/updates/seen', {
    schema: { tags: ['updates'], summary: 'Mark updates as shown to the user.', body: SeenBody },
  }, async (request) => ({ marked: await run(request, (tx, caller) => markSeen(tx, caller, request.body.ids)) }))

  app.get('/api/v1/expenses/summary', {
    schema: { tags: ['summary'], summary: 'Totals by category, cost center or item. scope=me includes the caller\'s private purchases; scope=household covers every member\'s non-private ones.', querystring: SummaryQuery },
  }, async (request) => run(request, (tx, caller) => getSummary(tx, caller, request.query)))
}