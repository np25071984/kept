import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import { requestLanguage } from '../oauth/language.js'
import type { App } from './app.js'
import { LANDING_CSP, landingPage } from './landing.js'

// Serves the landing page at / and the built web UI at /app/ (IMPLEMENTATION.md §6). Every path the app routes itself gets index.html.

const here = dirname(fileURLToPath(import.meta.url))
// dist/http/web.js finds dist/web; running from src finds the last build.
const ROOTS = [resolve(here, '../web'), resolve(here, '../../dist/web')]

// The app loads only its own files and calls only this origin; sign-in is a navigation, which CSP doesn't restrict.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile()
}

export async function webRoutes(app: App, webRoot?: string) {
  app.get('/', { config: { public: true }, schema: { hide: true } }, async (request, reply) =>
    reply
      .type('text/html; charset=utf-8')
      .header('content-security-policy', LANDING_CSP)
      .header('x-content-type-options', 'nosniff')
      // The language switch posts to /language, which returns to the page it came from.
      .header('referrer-policy', 'same-origin')
      .header('vary', 'cookie, accept-language')
      .header('cache-control', 'no-cache')
      .send(landingPage(requestLanguage(request.headers.cookie, request.headers['accept-language']))),
  )
  const root = (webRoot ? [webRoot] : ROOTS).find((dir) => existsSync(join(dir, 'index.html')))
  if (!root) {
    app.get('/app/*', { config: { public: true }, schema: { hide: true } }, async (_request, reply) =>
      reply.status(404).type('text/plain').send('The web UI is not built. Run npm run build, or npm run dev:web for development.'),
    )
    return
  }
  await app.register(fastifyStatic, { root, serve: false })
  app.get<{ Params: { '*': string } }>('/app/*', { config: { public: true }, schema: { hide: true } }, async (request, reply) => {
    const path = request.params['*']
    reply.header('content-security-policy', CSP).header('x-content-type-options', 'nosniff').header('referrer-policy', 'no-referrer')
    // Built assets have content hashes in their names, so they never change.
    const file = !path.includes('..') && isFile(join(root, path))
    if (file && path.startsWith('assets/')) return reply.header('cache-control', 'public, max-age=31536000, immutable').sendFile(path)
    if (file) return reply.sendFile(path)
    return reply.header('cache-control', 'no-cache').sendFile('index.html')
  })
}
