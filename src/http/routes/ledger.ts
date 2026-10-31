import { z } from 'zod'
import { deleteNote, getNotes, saveNote, updateNote } from '../../ledger/notes.js'
import { createRepeat, listRepeats, stopRepeat, updateRepeat } from '../../ledger/repeats.js'
import { getSummary } from '../../ledger/summary.js'
import { getUpdates, markSeen, takeUpdates } from '../../ledger/updates.js'
import { addCategory, addCostCenter, deleteCategory, deleteCostCenter, listCategories, listCostCenters, renameCategory, updateCostCenter } from '../../ledger/vocabulary.js'
import { addWatch, deleteWatch, listWatches } from '../../ledger/watches.js'
import { addCap, deleteCap, listCaps, updateCap } from '../../ledger/caps.js'
import { answerQuestion, flagMissingCharge, listQuestions } from '../../ledger/questions.js'
import type { App, RouteDeps } from '../app.js'
import { IdParams } from '../../api/common.js'
import {
  AnswerBody, Cap, CapBody, CapPatch, Category, CategoryBody, CategoryQuery, CategoryRename, CostCenter, CostCenterBody, CostCenterName,
  CostCenterPatch, MissingBody, MissingFlagged, Note, NoteBody, Question, QuestionParams, Repeat, RepeatBody, RepeatList, RepeatPatch,
  SeenBody, Summary, SummaryQuery, Update, UpdatesQuery, Watch, WatchBody,
} from '../../api/ledger.js'

export function ledgerRoutes(app: App, { run }: RouteDeps) {
  app.get('/api/v1/categories', {
    schema: { tags: ['vocabulary'], summary: 'The household\'s categories and subcategories.', response: { 200: z.object({ categories: z.array(Category) }) } },
  }, async (request) => ({ categories: await run(request, (tx) => listCategories(tx)) }))

  app.post('/api/v1/categories', {
    schema: { tags: ['vocabulary'], summary: 'Add a category or subcategory. A subcategory\'s parent must exist.', body: CategoryBody, response: { 201: Category } },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => addCategory(tx, caller, request.body.path))
  })

  app.patch('/api/v1/categories', {
    schema: { tags: ['vocabulary'], summary: 'Rename or move a category. Purchases, watched groups and repeats keep pointing at it.', body: CategoryRename, response: { 200: Category } },
  }, async (request) => run(request, (tx) => renameCategory(tx, request.body.path, request.body.new_path)))

  app.delete('/api/v1/categories', {
    schema: { tags: ['vocabulary'], summary: 'Delete a category nothing uses: no purchases, subcategories, watched groups or repeats.', querystring: CategoryQuery },
  }, async (request, reply) => {
    await run(request, (tx) => deleteCategory(tx, request.query.path))
    return reply.status(204).send()
  })

  app.get('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'The household\'s cost centers with their kind.', response: { 200: z.object({ cost_centers: z.array(CostCenter) }) } },
  }, async (request) => ({ cost_centers: await run(request, (tx) => listCostCenters(tx)) }))

  app.post('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'Add a cost center with its kind: Car, Home, Child, Pet or anything else.', body: CostCenterBody, response: { 201: CostCenter } },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => addCostCenter(tx, caller, request.body))
  })

  app.patch('/api/v1/cost-centers', {
    schema: { tags: ['vocabulary'], summary: 'Rename a cost center or change its kind. Purchases and repeats keep pointing at it.', body: CostCenterPatch, response: { 200: CostCenter } },
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
    schema: { tags: ['memory'], summary: 'The caller\'s watched groups.', response: { 200: z.object({ watches: z.array(Watch) }) } },
  }, async (request) => ({ watches: await run(request, (tx, caller) => listWatches(tx, caller)) }))

  app.post('/api/v1/watches', {
    schema: { tags: ['memory'], summary: 'Watch a category or an item. Watching one already watched returns it.', body: WatchBody, response: { 201: Watch } },
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

  app.get('/api/v1/questions', {
    schema: { tags: ['questions'], summary: 'Kept\'s open questions for the caller, most important first: connecting an assistant, possible duplicates, caps passed, recurring charges missing from a statement, API keys unused for a year. Connecting is worked out on each request, open while the caller has no assistant connected and no API key, and takes no answer.', response: { 200: z.object({ questions: z.array(Question) }) } },
  }, async (request) => ({ questions: await run(request, (tx, caller) => listQuestions(tx, caller)) }))

  app.post('/api/v1/questions/:id/answer', {
    schema: { tags: ['questions'], summary: 'Answer a question; the answers each kind takes are in the body\'s description.', params: QuestionParams, body: AnswerBody },
  }, async (request, reply) => {
    await run(request, (tx, caller) => answerQuestion(tx, caller, request.params.id, request.body.answer))
    return reply.status(204).send()
  })

  app.post('/api/v1/repeats/:id/missing', {
    schema: { tags: ['repeats'], summary: 'Record that a statement lacked this recurring charge, as an open question.', params: IdParams, body: MissingBody, response: { 201: MissingFlagged } },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => flagMissingCharge(tx, caller, request.params.id, request.body.period))
  })

  app.get('/api/v1/caps', {
    schema: { tags: ['memory'], summary: 'The caller\'s caps with what is spent toward each this month or year, private purchases included.', response: { 200: z.object({ caps: z.array(Cap) }) } },
  }, async (request) => ({ caps: await run(request, (tx, caller) => listCaps(tx, caller)) }))

  app.post('/api/v1/caps', {
    schema: { tags: ['memory'], summary: 'Set a cap on a category or one of the people & things, per month or year. A reminder, never a block.', body: CapBody, response: { 201: Cap } },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => addCap(tx, caller, request.body))
  })

  app.patch('/api/v1/caps/:id', {
    schema: { tags: ['memory'], summary: 'Change a cap\'s amount or period.', params: IdParams, body: CapPatch, response: { 200: Cap } },
  }, async (request) => run(request, (tx, caller) => updateCap(tx, caller, request.params.id, request.body)))

  app.delete('/api/v1/caps/:id', {
    schema: { tags: ['memory'], summary: 'Remove a cap.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => deleteCap(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.get('/api/v1/notes', {
    schema: { tags: ['memory'], summary: 'The caller\'s notes, newest first.', response: { 200: z.object({ notes: z.array(Note) }) } },
  }, async (request) => ({ notes: await run(request, (tx, caller) => getNotes(tx, caller)) }))

  app.post('/api/v1/notes', {
    schema: { tags: ['memory'], summary: 'Save a note the user agreed to.', body: NoteBody, response: { 201: Note } },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => saveNote(tx, caller, request.body.text))
  })

  app.patch('/api/v1/notes/:id', {
    schema: { tags: ['memory'], summary: 'Change a note\'s text.', params: IdParams, body: NoteBody, response: { 200: Note } },
  }, async (request) => run(request, (tx, caller) => updateNote(tx, caller, request.params.id, request.body.text)))

  app.delete('/api/v1/notes/:id', {
    schema: { tags: ['memory'], summary: 'Delete a note.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => deleteNote(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.get('/api/v1/repeats', {
    schema: { tags: ['repeats'], summary: 'The caller\'s repeats with their next date, amount and last logged purchase, and this month\'s recurring total with how much is still to come.', response: { 200: RepeatList } },
  }, async (request) => run(request, (tx, caller) => listRepeats(tx, caller)))

  app.post('/api/v1/repeats', {
    schema: { tags: ['repeats'], summary: 'Make a transaction repeat. It is the first occurrence; 409 already_repeats if it already repeats.', body: RepeatBody, response: { 201: Repeat } },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => createRepeat(tx, caller, request.body))
  })

  app.patch('/api/v1/repeats/:id', {
    schema: { tags: ['repeats'], summary: 'Change the amount, schedule or end from the next occurrence, or pause and resume.', params: IdParams, body: RepeatPatch, response: { 200: Repeat } },
  }, async (request) => run(request, (tx, caller) => updateRepeat(tx, caller, request.params.id, request.body)))

  app.delete('/api/v1/repeats/:id', {
    schema: { tags: ['repeats'], summary: 'Stop repeating. Transactions already created are kept.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => stopRepeat(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.get('/api/v1/updates', {
    schema: { tags: ['updates'], summary: 'What the ledger did on its own that the caller hasn\'t seen: repeats registered and possible duplicates.', querystring: UpdatesQuery, response: { 200: z.object({ updates: z.array(Update) }) } },
  }, async (request) => ({ updates: await run(request, (tx, caller) => getUpdates(tx, caller, request.query.all)) }))

  app.post('/api/v1/updates/take', {
    schema: { tags: ['updates'], summary: 'Return the caller\'s unseen updates and mark them seen, for an agent announcing them.', response: { 200: z.object({ updates: z.array(Update) }) } },
  }, async (request) => ({ updates: await run(request, (tx, caller) => takeUpdates(tx, caller)) }))

  app.post('/api/v1/updates/seen', {
    schema: { tags: ['updates'], summary: 'Mark updates as shown to the user.', body: SeenBody, response: { 200: z.object({ marked: z.number().int() }) } },
  }, async (request) => ({ marked: await run(request, (tx, caller) => markSeen(tx, caller, request.body.ids)) }))

  app.get('/api/v1/expenses/summary', {
    schema: { tags: ['summary'], summary: 'Totals by category, cost center, item or merchant. scope=me includes the caller\'s private purchases; scope=household covers every member\'s non-private ones, and folds a merchant fewer than two members bought from into "Other merchants".', querystring: SummaryQuery, response: { 200: Summary } },
  }, async (request) => run(request, (tx, caller) => getSummary(tx, caller, request.query)))
}