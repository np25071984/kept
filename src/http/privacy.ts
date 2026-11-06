import type { Language } from '../domain/language.js'
import { tr } from '../i18n.js'
import { escape } from '../oauth/pages.js'
import { siteHeader } from './siteHeader.js'

// The page at /privacy: what the hosted Kept stores and who handles it. Every statement is a promise, so a change
// to what Kept collects, a provider, log retention or backups changes this text in the same commit.

export const PRIVACY_UPDATED = '2026-11-06'
const SUPPORT = 'support@kept-ledger.com'

export const PRIVACY_CSP = "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"

export const PRIVACY_SECTIONS: [string, string][] = [
  ['Who runs Kept', `Kept at kept-ledger.com is run by Nikolai Poriadin in the United States. Questions: ${SUPPORT}. This policy doesn't cover a copy of Kept that someone runs on their own server.`],
  ['What Kept stores', 'Your name and email, your household\'s name, categories and people & things, and what you log: purchases, notes, watched items, caps, recurring bills and what your assistant read from a source. Kept doesn\'t store the files themselves or connect to your bank or inbox.'],
  ['Who sees it', 'Other household members see shared totals, never your purchases. Private purchases stay out of those totals.'],
  ['Who else handles it', 'DigitalOcean hosts Kept in the United States. Resend delivers sign-in and invite emails. Cloudflare checks for bots on the sign-in page. Your assistant is a separate service, so what you tell it is covered by its maker\'s privacy policy.'],
  ['What Kept doesn\'t do', 'Kept has no ads or analytics and doesn\'t sell your data. It uses only the cookies and browser storage needed for sign-in and your language.'],
  ['Logs', 'Server logs record requests, including IP addresses, and are deleted within 30 days.'],
  ['Backups', 'The server is backed up automatically. Deleted data and logs can stay in a backup for up to 30 days.'],
  ['Your data', `Download your data any time in Settings → Profile. Delete your account and data there too, or email ${SUPPORT} and it's done within 30 days. Owners can also remove a member and everything they logged.`],
  ['Changes', 'Updates appear on this page, with the date below.'],
]

const mailLink = (escaped: string) => escaped.replace(SUPPORT, `<a href="mailto:${SUPPORT}">${SUPPORT}</a>`)

export function privacyPage(lang: Language, origin: string): string {
  const t = (text: string) => escape(tr(lang, text))
  const updated = new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${PRIVACY_UPDATED}T00:00:00Z`))
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t('Privacy')} · Kept</title>
<meta name="description" content="${t('What Kept stores, who handles it, and how to download or delete your data.')}">
<link rel="canonical" href="${origin}/privacy">
<link rel="icon" href="/app/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/app/apple-touch-icon.png">
<link rel="stylesheet" href="/app/site.css">
<style>
  body { font-size: 16px; }
  main { max-width: 680px; margin: 0 auto; padding: 32px 16px 64px; line-height: 1.55; }
  h1 { margin: 0 0 24px; }
  h2 { font-size: 18px; margin: 24px 0 6px; }
  p { margin: 0; }
  .updated { color: var(--muted); font-size: 14px; margin-top: 32px; }
</style>
</head>
<body>
${siteHeader(lang, { end: `<a href="/app/">${t('Sign in')}</a>` })}
<main>
<h1>${t('Privacy')}</h1>
${PRIVACY_SECTIONS.map(([heading, text]) => `<h2>${t(heading)}</h2>\n<p>${mailLink(t(text))}</p>`).join('\n')}
<p class="updated">${escape(tr(lang, 'Last updated {date}', { date: updated }))}</p>
</main>
</body>
</html>`
}
