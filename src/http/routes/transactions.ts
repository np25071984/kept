import {
  addSource, createTransactions, deleteTransaction, getTransaction, mergeTransactions, patchTransaction,
} from '../../ledger/transactions.js'
import { listPurchases } from '../../ledger/purchaseList.js'
import { IdParams } from '../../api/common.js'
import { MergeBody, SourceBody, TransactionPatch, TransactionQuery, TransactionsBody } from '../../api/transactions.js'
import type { App, RouteDeps } from '../app.js'

const tags = ['transactions']

export function transactionRoutes(app: App, { run }: RouteDeps) {
  app.post('/api/v1/transactions', {
    schema: {
      tags,
      summary: 'Log one transaction, or several as { transactions: [...] }. Each is matched against the caller\'s existing transactions; the result says whether it was created, attached or flagged as a possible duplicate.',
      body: TransactionsBody,
    },
  }, async (request, reply) => {
    const body = request.body
    const bulk = 'transactions' in body
    const results = await run(request, (tx, caller) => createTransactions(tx, caller, bulk ? body.transactions : [body]))
    reply.status(201)
    return bulk ? { results } : results[0]
  })

  app.get('/api/v1/transactions', {
    schema: { tags, summary: 'The caller\'s own transactions, newest first, with the count and total of everything that matches. Never returns other members\' purchases.', querystring: TransactionQuery },
  }, async (request) => run(request, (tx, caller) => listPurchases(tx, caller, request.query)))

  app.get('/api/v1/transactions/:id', {
    schema: { tags, summary: 'One of the caller\'s transactions.', params: IdParams },
  }, async (request) => run(request, (tx, caller) => getTransaction(tx, caller, request.params.id)))

  app.patch('/api/v1/transactions/:id', {
    schema: { tags, summary: 'Edit one of the caller\'s transactions. Edited fields win over later sources.', params: IdParams, body: TransactionPatch },
  }, async (request) => run(request, (tx, caller) => patchTransaction(tx, caller, request.params.id, request.body)))

  app.delete('/api/v1/transactions/:id', {
    schema: { tags, summary: 'Delete one of the caller\'s transactions.', params: IdParams },
  }, async (request, reply) => {
    await run(request, (tx, caller) => deleteTransaction(tx, caller, request.params.id))
    return reply.status(204).send()
  })

  app.post('/api/v1/transactions/:id/sources', {
    schema: { tags, summary: 'Attach what the agent read from a photo, document, email or statement to one of the caller\'s transactions.', params: IdParams, body: SourceBody },
  }, async (request, reply) => {
    reply.status(201)
    return run(request, (tx, caller) => addSource(tx, caller, request.params.id, request.body))
  })

  app.post('/api/v1/transactions/:id/merge', {
    schema: { tags, summary: 'Merge another of the caller\'s transactions into this one, keeping both sets of sources.', params: IdParams, body: MergeBody },
  }, async (request) => run(request, (tx, caller) => mergeTransactions(tx, caller, request.params.id, request.body.other_id)))
}