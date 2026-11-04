import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import { Export } from '../../api/export.js'
import { todayIn } from '../../domain/dates.js'
import { purchasesCsv } from '../../domain/export.js'
import type { Caller } from '../../ledger/caller.js'
import { allPurchases, exportData } from '../../ledger/export.js'
import type { App, RouteDeps } from '../app.js'

function asDownload(reply: FastifyReply, caller: Caller, name: string, extension: string) {
  reply.header('content-disposition', `attachment; filename="kept-${name}-${todayIn(caller.timezone, new Date())}.${extension}"`)
  reply.header('cache-control', 'no-store')
}

export function exportRoutes(app: App, { run }: RouteDeps) {
  app.get('/api/v1/export', {
    schema: { tags: ['export'], summary: 'Everything the caller owns, as a JSON file: purchases, notes, watched groups, caps and repeats.', response: { 200: Export } },
  }, async (request, reply) => run(request, (tx, caller) => {
    asDownload(reply, caller, 'export', 'json')
    return exportData(tx, caller)
  }))

  app.get('/api/v1/export/purchases.csv', {
    schema: {
      tags: ['export'],
      summary: 'The caller\'s purchases as a CSV file for a spreadsheet, one row each.',
      response: { 200: { description: 'One row per purchase.', content: { 'text/csv': { schema: z.string() } } } },
    },
  }, async (request, reply) => {
    const csv = await run(request, async (tx, caller) => {
      asDownload(reply, caller, 'purchases', 'csv')
      return purchasesCsv(await allPurchases(tx, caller), caller.currency)
    })
    return reply.type('text/csv; charset=utf-8').send(csv)
  })
}
