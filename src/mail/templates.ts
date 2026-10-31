import type { Language } from '../domain/language.js'
import { tr } from '../i18n.js'

// The emails Kept sends: subject, plain text and HTML. Pure, so their wording is unit-tested (IMPLEMENTATION.md §5.4).

export interface Email {
  subject: string
  text: string
  html: string
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function layout(lang: Language, body: string): string {
  return `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#fafaf7;font:16px/1.5 system-ui,-apple-system,sans-serif;color:#1d1d1b">
<div style="max-width:440px;margin:0 auto"><div style="font-weight:700;color:#2f6b4f;margin-bottom:16px">Kept</div>${body}</div></body></html>`
}

// The code stays one run of digits next to the word "code" in the subject and the first line: phones detect it there
// and offer "Copy code" in the notification. Letter-spacing keeps the big copy readable without breaking the run.
export function signInCodeEmail(code: string, lang: Language = 'en'): Email {
  const line = tr(lang, 'Kept sign-in code: {code}', { code })
  const note = tr(lang, "Type it on the sign-in page. It works for 10 minutes. If you didn't try to sign in, ignore this email.")
  return {
    subject: line,
    text: `${line}\n\n${note}`,
    html: layout(lang, `<p>${escape(line)}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:0.15em;margin:8px 0 16px">${escape(code)}</p>
<p style="color:#6b6b66">${escape(note)}</p>`),
  }
}

// `connect` is the MCP address; the web app lives next to it.
export function inviteEmail(input: { connect: string; inviter: string; household: string }, lang: Language = 'en'): Email {
  const app = `${input.connect.replace(/\/mcp$/, '')}/app/`
  const vars = { inviter: input.inviter, household: input.household }
  const add = tr(lang, 'Add this address to your AI assistant (Claude, ChatGPT or Gemini) as a custom connector, and sign in with this email:')
  const stays = tr(lang, 'Your purchases stay yours; the household shares categories, people & things, and totals.')
  return {
    subject: tr(lang, '{inviter} invited you to {household} on Kept', vars),
    text: [tr(lang, '{inviter} invited you to track spending with {household} on Kept.', vars), '', add, input.connect, '', tr(lang, 'Or sign in on the web: {app}', { app }), '', stays].join('\n'),
    html: layout(lang, `<p>${escape(tr(lang, '{inviter} invited you to track spending with {household} on Kept.', vars))}</p>
<p>${escape(add)}</p>
<p style="font-family:ui-monospace,monospace;background:#fff;border:1px solid #d9d9d2;border-radius:8px;padding:10px 12px;word-break:break-all">${escape(input.connect)}</p>
<p>${tr(lang, 'Or {link}.', { link: `<a href="${escape(app)}" style="color:#2f6b4f">${escape(tr(lang, 'sign in on the web'))}</a>` })}</p>
<p style="color:#6b6b66">${escape(stays)}</p>`),
  }
}

// An invite to an email that already has an account: an account is in one household, so there is nothing to join.
export function inviteToMemberEmail(input: { inviter: string; household: string }, lang: Language = 'en'): Email {
  const vars = { inviter: input.inviter, household: input.household }
  const invited = tr(lang, '{inviter} invited you to track spending with {household} on Kept.', vars)
  const cannot = tr(lang, 'This email already has a Kept account, and an account belongs to one household, so it can\'t join. To join, ask {inviter} to invite another email.', vars)
  return {
    subject: tr(lang, '{inviter} invited you to {household} on Kept', vars),
    text: [invited, '', cannot].join('\n'),
    html: layout(lang, `<p>${escape(invited)}</p>
<p>${escape(cannot)}</p>`),
  }
}
