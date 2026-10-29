// The sign-in and consent pages an assistant opens when a member connects Kept. Plain server-rendered HTML.

export function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Kept</title>
<link rel="icon" href="/app/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/app/apple-touch-icon.png">
<style>
  :root { color-scheme: light dark; --bg: #fafaf7; --fg: #1d1d1b; --muted: #6b6b66; --line: #d9d9d2; --accent: #2f6b4f; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #ecece6; --muted: #a3a39c; --line: #3a3a37; --accent: #7cc4a0; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, sans-serif; }
  main { max-width: 420px; margin: 0 auto; padding: 48px 16px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { color: var(--muted); margin: 0 0 20px; }
  label { display: block; font-weight: 600; margin: 16px 0 6px; }
  input { width: 100%; padding: 12px; font: inherit; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; }
  input.code { letter-spacing: 0.3em; font-size: 22px; text-align: center; }
  button { width: 100%; margin-top: 20px; padding: 12px; font: inherit; font-weight: 600; border: 0; border-radius: 8px; background: var(--accent); color: var(--bg); cursor: pointer; }
  button.secondary { background: transparent; color: var(--muted); border: 1px solid var(--line); margin-top: 10px; }
  .error { color: #c0392b; }
  .brand { font-weight: 700; letter-spacing: 0.02em; color: var(--accent); margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
  .brand img { border-radius: 6px; }
</style>
</head>
<body><main><div class="brand"><img src="/app/icon.svg" width="24" height="24" alt="">Kept</div>${body}</main></body>
</html>`
}

const cancel = (uid: string) =>
  `<form method="post" action="/oauth/interaction/${escape(uid)}/abort"><button class="secondary" type="submit">Cancel</button></form>`

// clientName is null for Kept's own web app, which has nowhere to cancel back to.
export function emailPage(uid: string, clientName: string | null, error?: string): string {
  const intro = clientName
    ? `${escape(clientName)} wants to use Kept as you. Enter the email you use with Kept, or the one you were invited with.`
    : 'Review and fix what your assistant logged. Enter your email, or the one you were invited with, and we\'ll send you a code.'
  return layout('Sign in', `
<h1>Sign in to Kept</h1>
<p>${intro}</p>
${error ? `<p class="error">${escape(error)}</p>` : ''}
<form method="post" action="/oauth/interaction/${escape(uid)}/email">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="email" required autofocus>
  <button type="submit">Email me a code</button>
</form>
${clientName ? cancel(uid) : ''}`)
}

export function codePage(uid: string, email: string, error?: string): string {
  return layout('Enter your code', `
<h1>Check your email</h1>
<p>If ${escape(email)} has a Kept account or an invite, we sent it a 6-digit code. It works for 10 minutes.</p>
${error ? `<p class="error">${escape(error)}</p>` : ''}
<form method="post" action="/oauth/interaction/${escape(uid)}/code">
  <label for="code">Code</label>
  <input id="code" class="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" required autofocus>
  <button type="submit">Sign in</button>
</form>
<form method="post" action="/oauth/interaction/${escape(uid)}/email">
  <input type="hidden" name="email" value="${escape(email)}">
  <button class="secondary" type="submit">Send a new code</button>
</form>`)
}

export function joinPage(uid: string, household: string, inviter: string, error?: string): string {
  return layout('Join your household', `
<h1>Join ${escape(household)}</h1>
<p>${escape(inviter)} invited you. Your purchases stay yours; the household shares categories, people &amp; things, and totals.</p>
${error ? `<p class="error">${escape(error)}</p>` : ''}
<form method="post" action="/oauth/interaction/${escape(uid)}/join">
  <label for="name">Your name</label>
  <input id="name" name="name" autocomplete="given-name" required autofocus>
  <button type="submit">Join</button>
</form>
${cancel(uid)}`)
}

export function consentPage(uid: string, clientName: string): string {
  return layout('Allow access', `
<h1>Allow ${escape(clientName)}?</h1>
<p>${escape(clientName)} will be able to log and edit your purchases, read your spending and household totals, change the household's categories, and keep your notes and watched groups, as you.</p>
<form method="post" action="/oauth/interaction/${escape(uid)}/consent"><button type="submit">Allow</button></form>
${cancel(uid)}`)
}

export function errorPage(message: string): string {
  return layout('Something went wrong', `<h1>Something went wrong</h1><p>${escape(message)}</p><p>Go back to your assistant and connect Kept again.</p>`)
}