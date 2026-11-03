import type { FastifyInstance } from 'fastify'
import { countRequest, limitFor, windowOver, type Limit, type Window } from '../domain/requestLimits.js'
import { tooMany } from '../ledger/errors.js'

// Counts requests per IP address in memory: Kept runs as one process (IMPLEMENTATION.md §4).
export function limitRequests(app: FastifyInstance, now: () => number = Date.now) {
  const windows = new Map<string, { window: Window; limit: Limit }>()
  let pruned = now()
  app.addHook('onRequest', async (request, reply) => {
    const limit = limitFor(request.method, request.url)
    if (!limit) return
    const at = now()
    if (at - pruned > 60_000) {
      for (const [key, entry] of windows) if (windowOver(entry.window, entry.limit, at)) windows.delete(key)
      pruned = at
    }
    const key = `${limit.bucket} ${request.ip}`
    const counted = countRequest(windows.get(key)?.window, limit, at)
    windows.set(key, { window: counted.window, limit })
    if (counted.allowed) return
    const seconds = Math.ceil(counted.retryAfterMs / 1000)
    reply.header('retry-after', String(seconds))
    throw tooMany('rate_limited', `Too many requests. Try again in ${seconds} seconds.`)
  })
}
