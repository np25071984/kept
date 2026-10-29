import { deleteNote, getNotes, saveNote, updateNote } from '../../ledger/notes.js'
import { createRepeat, listRepeats, stopRepeat, updateRepeat } from '../../ledger/repeats.js'
import { getSummary } from '../../ledger/summary.js'
import { getUpdates, markSeen } from '../../ledger/updates.js'
import { addCategory, addCostCenter, deleteCategory, deleteCostCenter, listCategories, listCostCenters, renameCategory, updateCostCenter } from '../../ledger/vocabulary.js'
import { addWatch, deleteWatch, listWatches } from '../../ledger/watches.js'
import type { App, RouteDeps } from '../app.js'
import {
  CategoryBody, CategoryQuery, CategoryRename, CostCenterBody, CostCenterName, CostCenterPatch, IdParams, NoteBody, RepeatBody, RepeatPatch,
  SeenBody, SummaryQuery, UpdatesQuery, WatchBody,
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
    schema: { tags: ['vocabulary'], summary: 'Rename or move a category. Purchases, watched groups and repeats keep pointing at it.', body: CategoryRename },
  }, async (request) => run(request, (tx) => renameCategory(tx, request.body.path, request.body.new_path)))

  app.delete('/api/v1/categories', {
    schema: { tags: ['vocabulary'], summary: 'Delete a category nothing uses: no purchases, subcategories, watched groups or repeats.', querystring: CategoryQuery },
  }, async (request, reply) => {
    await run(request, (tx) => deleteCategory(tx, request.query.path))
    return reply.status(204).send()
  })

  app.get('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'The household\'s cost centers with their kind.' },
  }, async (request) => ({ cost_centers: await run(request, (tx) => listCostCenters(tx)) }))

  app.post('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'Add a cost center with its kind: Car, Home, Child, Pet or anything else.', body: CostCenterBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => addCostCenter(tx, caller, request.body))
  })

  app.patch('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'Rename a cost center or change its kind. Purchases and repeats keep pointing at it.', body: CostCenterPatch },
  }, async (request) => {
    const { name, ...patch } = request.body
    return run(request, (tx) => updateCostCenter(tx, name, patch))
  })

  app.delete('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'Delete a cost center nothing uses: no purchases or repeats.', querystring: CostCenterName },
  }, async (request, reply) => {
    await run(request, (tx) => deleteCostCenter(tx, request.query.name))
    return reply.status(204).send()
  })

  app.get('/api/v1/watches', {
    schema: { tags: ['memory'], summary: 'The caller\'s watched groups.' },
  }, async (request) => ({ watches: await run(request, (tx, caller) => listWatches(tx, caller)) }))

  app.post('/api/v1/watches', {
    schema: { tags: ['memory'], summary: 'Watch a category or an item. Watching one already watched returns it.', body: WatchBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => addWatch(tx, caller, request.body))
  })

  app.delete('/api/v1/watches/:id', {
    schema: { tags: ['memory'], summary: 'Stop watching a group. Purchases already logged keep their checked groups.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => deleteWatch(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.get('/api/v1/notes', {
    schema: { tags: ['memory'], summary: 'The caller\'s notes, newest first.' },
  }, async (request) => ({ notes: await run(request, (tx, caller) => getNotes(tx, caller)) }))

  app.post('/api/v1/notes', {
    schema: { tags: ['memory'], summary: 'Save a note the user agreed to.', body: NoteBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => saveNote(tx, caller, request.body.text))
  })

  app.patch('/api/v1/notes/:id', {
    schema: { tags: ['memory'], summary: 'Change a note\'s text.', params: IdParams, body: NoteBody },
  }, async (request) => run(request, (tx, caller) => updateNote(tx, caller, request.params.id, request.body.text)))

  app.delete('/api/v1/notes/:id', {
    schema: { tags: ['memory'], summary: 'Delete a note.', params: IdParams },
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