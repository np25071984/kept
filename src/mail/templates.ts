// The emails Kept sends: subject, plain text and HTML. Pure, so their wording is unit-tested (IMPLEMENTATION.md §5.4).

export interface Email {
  subject: string
  text: string
  html: string
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function layout(body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fafaf7;font:16px/1.5 system-ui,-apple-system,sans-serif;color:#1d1d1b">
<div style="max-width:440px;margin:0 auto"><div style="font-weight:700;color:#2f6b4f;margin-bottom:16px">Kept</div>${body}</div></body></html>`
}

export function signInCodeEmail(code: string): Email {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
  return {
    subject: `${spaced} is your Kept code`,
    text: `Your Kept sign-in code is ${spaced}.\n\nType it on the sign-in page. It works for 10 minutes.\n\nIf you didn't try to sign in, ignore this email.`,
    html: layout(`<p>Your sign-in code:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:0.15em;margin:8px 0 16px">${escape(spaced)}</p>
<p style="color:#6b6b66">Type it on the sign-in page. It works for 10 minutes. If you didn't try to sign in, ignore this email.</p>`),
  }
}

// `connect` is the MCP address; the web app lives next to it.
export function inviteEmail(input: { connect: string; inviter: string; household: string }): Email {
  const app = `${input.connect.replace(/\/mcp$/, '')}/app/`
  return {
    subject: `${input.inviter} invited you to ${input.household} on Kept`,
    text: [
      `${input.inviter} invited you to track spending with ${input.household} on Kept.`,
      '',
      `Add this address to your AI assistant (Claude, ChatGPT or Gemini) as a custom connector, and sign in with this email:`,
      input.connect,
      '',
      `Or sign in on the web: ${app}`,
      '',
      'Your purchases stay yours; the household shares categories, people & things, and totals.',
    ].join('\n'),
    html: layout(`<p><strong>${escape(input.inviter)}</strong> invited you to track spending with <strong>${escape(input.household)}</strong> on Kept.</p>
<p>Add this address to your AI assistant (Claude, ChatGPT or Gemini) as a custom connector, and sign in with this email:</p>
<p style="font-family:ui-monospace,monospace;background:#fff;border:1px solid #d9d9d2;border-radius:8px;padding:10px 12px;word-break:break-all">${escape(input.connect)}</p>
<p>Or <a href="${escape(app)}" style="color:#2f6b4f">sign in on the web</a>.</p>
<p style="color:#6b6b66">Your purchases stay yours; the household shares categories, people &amp; things, and totals.</p>`),
  }
}
