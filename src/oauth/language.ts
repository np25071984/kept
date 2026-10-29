import type { FastifyInstance } from 'fastify'
import { isLanguage, pickLanguage, type Language } from '../domain/language.js'

// The language of a signed-out page: the cookie the switch sets, else the browser's (VISION.md §4.C).

export const LANGUAGE_COOKIE = 'kept_lang'

export function requestLanguage(cookie: string | undefined, accept: string | string[] | undefined): Language {
  const saved = cookie?.split(/;\s*/).find((c) => c.startsWith(`${LANGUAGE_COOKIE}=`))?.split('=')[1]
  return pickLanguage(undefined, saved, Array.isArray(accept) ? accept[0] : accept)
}

// The switch under every sign-in page: sets the cookie and goes back to the page it was on.
export function languageRoutes(app: FastifyInstance) {
  app.post<{ Body: { lang?: string } }>('/language', { config: { public: true }, schema: { hide: true } }, async (request, reply) => {
    const lang = request.body?.lang
    if (isLanguage(lang)) reply.header('set-cookie', `${LANGUAGE_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`)
    const referer = request.headers.referer
    let back = '/app/'
    try {
      const url = new URL(referer ?? '')
      if (url.host === request.headers.host) back = url.pathname + url.search
    } catch {
      // No referer: the app.
    }
    return reply.status(303).header('location', back).send()
  })
}
