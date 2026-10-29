import type { Language } from '../domain/language.js'
import { zoneOptions } from '../domain/timezones.js'
import { tr } from '../i18n.js'
import { siteHeader } from '../http/siteHeader.js'
import { ZONE_PICKER_SCRIPT, ZONE_PICKER_STYLE } from './zonePicker.js'

// The sign-in and consent pages an assistant opens when a member connects Kept. Plain server-rendered HTML.

export function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// The palette, header and language menu come from /app/site.css and siteHeader, as on the landing page and in the
// web app; the form sits in a card narrow enough to read on a phone.
function layout(lang: Language, title: string, body: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Kept</title>
<link rel="icon" href="/app/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/app/apple-touch-icon.png">
<link rel="stylesheet" href="/app/site.css">
<style>
  body { font-size: 16px; }
  main { max-width: 480px; margin: 0 auto; padding: 40px 16px 64px; }
  .signin { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 28px 24px; }
  .signin h1 { margin: 0 0 8px; }
  .signin p { color: var(--muted); margin: 0 0 20px; }
  .signin label { display: block; font-size: 15px; font-weight: 600; color: var(--fg); margin: 16px 0 6px; }
  .signin input, .signin select { padding: 12px; background: var(--bg); }
  .signin input.code { letter-spacing: 0.3em; font-size: 22px; text-align: center; }
  .signin button:not(.picker-trigger) { width: 100%; margin-top: 20px; padding: 12px; font-weight: 600; border: 0; background: var(--accent); color: var(--accent-fg); }
  .signin button.secondary { background: transparent; color: var(--muted); border: 1px solid var(--line); margin-top: 10px; }
  .signin .error { color: var(--danger); }
  .hint { font-size: 13px; color: var(--muted); margin: 4px 0 12px; }
  @media (max-width: 480px) { main { padding: 16px 8px 40px; } .signin { padding: 22px 16px; } }
${ZONE_PICKER_STYLE}
</style>
</head>
<body>
${siteHeader(lang)}
<main><div class="signin">${body}</div></main>
</body>
</html>`
}

const cancel = (lang: Language, uid: string) =>
  `<form method="post" action="/oauth/interaction/${escape(uid)}/abort"><button class="secondary" type="submit">${tr(lang, 'Cancel')}</button></form>`

// clientName is null for Kept's own web app, which has nowhere to cancel back to.
// Error messages arrive in English and are shown in the page's language.
const problem = (lang: Language, error?: string) => (error ? `<p class="error">${escape(tr(lang, error))}</p>` : '')

export function emailPage(lang: Language, uid: string, clientName: string | null, error?: string): string {
  const intro = clientName
    ? escape(tr(lang, '{client} wants to use Kept as you. Enter the email you use with Kept, or the one you were invited with.', { client: clientName }))
    : escape(tr(lang, "Review and fix what your assistant logged. Enter your email, or the one you were invited with, and we'll send you a code."))
  return layout(lang, tr(lang, 'Sign in'), `
<h1>${tr(lang, 'Sign in to Kept')}</h1>
<p>${intro}</p>
${problem(lang, error)}
<form method="post" action="/oauth/interaction/${escape(uid)}/email">
  <label for="email">${tr(lang, 'Email')}</label>
  <input id="email" name="email" type="email" autocomplete="email" required autofocus>
  <button type="submit">${tr(lang, 'Email me a code')}</button>
</form>
${clientName ? cancel(lang, uid) : ''}`)
}

export function codePage(lang: Language, uid: string, email: string, error?: string): string {
  return layout(lang, tr(lang, 'Enter your code'), `
<h1>${tr(lang, 'Check your email')}</h1>
<p>${escape(tr(lang, 'We sent a 6-digit code to {email}. It works for 10 minutes.', { email: email === 'your email' ? tr(lang, 'your email') : email }))}</p>
${problem(lang, error)}
<form method="post" action="/oauth/interaction/${escape(uid)}/code">
  <label for="code">${tr(lang, 'Code')}</label>
  <input id="code" class="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" required autofocus>
  <button type="submit">${tr(lang, 'Sign in')}</button>
</form>
<form method="post" action="/oauth/interaction/${escape(uid)}/email">
  <input type="hidden" name="email" value="${escape(email)}">
  <button class="secondary" type="submit">${tr(lang, 'Send a new code')}</button>
</form>`)
}

export function joinPage(lang: Language, uid: string, household: string, inviter: string, error?: string): string {
  return layout(lang, tr(lang, 'Join your household'), `
<h1>${escape(tr(lang, 'Join {household}', { household }))}</h1>
<p>${escape(tr(lang, '{inviter} invited you. Your purchases stay yours; the household shares categories, people & things, and totals.', { inviter }))}</p>
${problem(lang, error)}
<form method="post" action="/oauth/interaction/${escape(uid)}/join">
  <label for="name">${tr(lang, 'Your name')}</label>
  <input id="name" name="name" autocomplete="given-name" required autofocus>
  <button type="submit">${tr(lang, 'Join')}</button>
</form>
${cancel(lang, uid)}`)
}

// After the code, for an email with no account and no invite.
export function createPage(lang: Language, uid: string, email: string, error?: string): string {
  const preferred = lang === 'ru' ? 'RUB' : 'USD'
  const currencies = Intl.supportedValuesOf('currency').map((code) => `<option value="${code}"${code === preferred ? ' selected' : ''}>${code}</option>`).join('')
  const groups = new Map<string, string[]>()
  for (const o of zoneOptions(Intl.supportedValuesOf('timeZone'), new Date())) groups.set(o.region, [...(groups.get(o.region) ?? []), `<option value="${escape(o.id)}">${escape(o.label)}</option>`])
  const zones = [...groups].map(([region, options]) => `<optgroup label="${escape(region)}">${options.join('')}</optgroup>`).join('')
  return layout(lang, tr(lang, 'Create your household'), `
<h1>${tr(lang, 'Create your household')}</h1>
<p>${escape(tr(lang, "{email} isn't in a household yet. Joining someone else's? Ask them to invite this email, then sign in again.", { email }))}</p>
${problem(lang, error)}
<form method="post" action="/oauth/interaction/${escape(uid)}/create">
  <label for="household">${tr(lang, 'Household name')}</label>
  <input id="household" name="household" placeholder="${escape(tr(lang, 'The Smiths'))}" required autofocus>
  <label for="name">${tr(lang, 'Your name')}</label>
  <input id="name" name="name" autocomplete="given-name" required>
  <label for="currency">${tr(lang, 'Currency')}</label>
  <select id="currency" name="currency">${currencies}</select>
  <label for="timezone">${tr(lang, 'Time zone')}</label>
  <select id="timezone" name="timezone" data-search="${escape(tr(lang, 'Search time zones'))}" data-none="${escape(tr(lang, 'No time zone matches "{query}"'))}">${zones}</select>
  <p class="hint">${tr(lang, 'Currency can change until the first purchase.')}</p>
  <button type="submit">${tr(lang, 'Create household')}</button>
</form>
<script>${ZONE_PICKER_SCRIPT}</script>
${cancel(lang, uid)}`)
}

export function consentPage(lang: Language, uid: string, clientName: string): string {
  return layout(lang, tr(lang, 'Allow access'), `
<h1>${escape(tr(lang, 'Allow {client}?', { client: clientName }))}</h1>
<p>${escape(tr(lang, "{client} will be able to log and edit your purchases, read your spending and household totals, change the household's categories, and keep your notes and watched groups, as you.", { client: clientName }))}</p>
<form method="post" action="/oauth/interaction/${escape(uid)}/consent"><button type="submit">${tr(lang, 'Allow')}</button></form>
${cancel(lang, uid)}`)
}

export function errorPage(lang: Language, message: string): string {
  return layout(lang, tr(lang, 'Something went wrong'), `<h1>${tr(lang, 'Something went wrong')}</h1><p>${escape(tr(lang, message))}</p><p>${tr(lang, 'Go back to your assistant and connect Kept again.')}</p>`)
}
