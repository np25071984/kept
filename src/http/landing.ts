import { createHash } from 'node:crypto'
import type { Language } from '../domain/language.js'
import { tr } from '../i18n.js'
import { escape } from '../oauth/pages.js'
import { CHAT_SCRIPT, CHAT_STYLE, chatData, conversations } from './landingChat.js'

// The page at / (VISION.md §4.C): what Kept is, what happens to the data, which assistants it works with.
// Plain server-rendered HTML with no tracking; the only cookie is the language the switch sets.

// A visitor already signed in on this browser goes straight to the app.
const SCRIPT = "try { if (localStorage.getItem('kept.refresh_token')) location.replace('/app/') } catch {}"

const hash = (script: string) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`

export const LANDING_CSP = `default-src 'none'; style-src 'unsafe-inline'; script-src ${hash(SCRIPT)} ${hash(CHAT_SCRIPT)}; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`

const STYLE = `
:root { color-scheme: light dark; --bg: #fafaf7; --surface: #fff; --fg: #1d1d1b; --muted: #6b6b66; --line: #e2e2db; --accent: #2f6b4f; --accent-fg: #fafaf7; --accent-soft: #e4efe8; --chat-bg: #ece5dc; --chat-dot: #ddd3c6; --chat-out: #d9f2dc; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --surface: #1f1f1d; --fg: #ecece6; --muted: #a3a39c; --line: #34342f; --accent: #7cc4a0; --accent-fg: #10221a; --accent-soft: #1f3329; --chat-bg: #12100e; --chat-dot: #1f1c18; --chat-out: #1f3a2c; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 10px; }
h2 { font-size: 16px; margin: 0 0 12px; }
h3 { font-size: 14px; margin: 0 0 6px; }
p { margin: 0 0 12px; }
a { color: var(--accent); }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.topbar { background: var(--surface); border-bottom: 1px solid var(--line); }
.topbar-inner { max-width: 1040px; margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.brand { font-weight: 700; letter-spacing: 0.02em; color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
.brand img { border-radius: 6px; }
nav { display: flex; gap: 2px; flex: 1; flex-wrap: wrap; }
nav a { white-space: nowrap; padding: 6px 10px; border-radius: 8px; text-decoration: none; color: var(--fg); font-size: 14px; }
.right { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; margin-left: auto; }
@media (max-width: 720px) { nav { order: 3; flex-basis: 100%; } }
.langmenu { position: relative; }
.langmenu summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 8px; }
.langmenu summary::-webkit-details-marker { display: none; }
.langmenu .code { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; }
.langmenu form { position: absolute; right: 0; top: calc(100% + 4px); z-index: 10; min-width: 160px; display: grid; padding: 6px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
.langmenu button { text-align: left; border: 0; background: none; padding: 7px 10px; border-radius: 6px; font: inherit; color: var(--fg); cursor: pointer; }
.langmenu button:hover { background: var(--bg); }
.langmenu button[aria-checked="true"] { color: var(--accent); font-weight: 600; }
main { max-width: 1040px; margin: 0 auto; padding: 24px 16px 48px; }
section { margin-bottom: 28px; }
.hero { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 32px; align-items: center; padding: 24px 0 8px; }
@media (max-width: 720px) { .hero { grid-template-columns: 1fr; } }
.demo { justify-self: center; width: 100%; max-width: 360px; }
.phone { width: 100%; border: 1px solid var(--line); border-radius: 28px; overflow: hidden; background: var(--surface); box-shadow: 0 8px 24px rgb(0 0 0 / 0.08); }
.phone-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 14px; font-weight: 600; }
.avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-size: 13px; }
.status { font-weight: 400; color: var(--muted); font-size: 12px; }
.phone-input { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-top: 1px solid var(--line); }
.phone-input span { flex: 1; padding: 7px 12px; border-radius: 18px; background: var(--bg); color: var(--muted); font-size: 13px; }
.phone-input b { width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 13px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.features { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 720px) { .features { grid-template-columns: 1fr; } }
.list { list-style: none; padding: 0; margin: 8px 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.list li { padding: 10px 14px; }
.list li + li { border-top: 1px solid var(--line); }
.assistants { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.assistants span { padding: 6px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-weight: 600; font-size: 14px; }
footer { border-top: 1px solid var(--line); margin-top: 32px; padding-top: 16px; display: flex; flex-wrap: wrap; gap: 16px; }
`

const GLOBE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'

export function landingPage(lang: Language): string {
  const t = (text: string) => escape(tr(lang, text))
  const option = (code: Language, name: string) => `<button type="submit" role="menuitemradio" name="lang" value="${code}" lang="${code}" aria-checked="${lang === code}">${name}</button>`
  const chats = conversations(lang)
  const first = chats[0]!
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t('Kept: tell your assistant what you spent')}</title>
<meta name="description" content="${t("Kept teaches the AI you already use to track your household's spending: what to ask, how to file it, and what to remember. No forms, no bank logins.")}">
<link rel="icon" href="/app/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/app/apple-touch-icon.png">
<script>${SCRIPT}</script>
<style>${STYLE}${CHAT_STYLE}</style>
</head>
<body>
<header class="topbar"><div class="topbar-inner">
  <a class="brand" href="/"><img src="/app/icon.svg" width="22" height="22" alt="">Kept</a>
  <nav><a href="#how">${t('How it works')}</a><a href="#privacy">${t('Your data')}</a><a href="#assistants">${t('Assistants')}</a></nav>
  <span class="right">
    <details class="langmenu"><summary aria-label="${t('Language')}">${GLOBE}<span class="code">${lang.toUpperCase()}</span></summary><form method="post" action="/language" role="menu">${option('en', 'English')}${option('ru', 'Русский')}</form></details>
    <a href="/app/">${t('Sign in')}</a>
  </span>
</div></header>
<main>
<section class="hero">
  <div>
    <h1>${t('Tell your assistant what you spent. Kept keeps the books.')}</h1>
    <p class="muted">${t("Kept teaches the AI you already use to track your household's spending: what to ask, how to file it, and what to remember. No forms, no bank logins.")}</p>
  </div>
  <div class="demo">
    <div class="phone">
      <div class="phone-head"><span class="avatar">AI</span><div>${t('Your assistant')}<div class="status">${t('with Kept')}</div></div></div>
      <div class="chat" id="chat" aria-hidden="true">
        <div class="day">${t('Today')}</div>
        ${first.messages.map((m) => `<div class="bubble ${m.who}"><div class="text">${escape(m.text)}</div><span class="time">${m.time}</span></div>`).join('')}
      </div>
      <div class="phone-input" aria-hidden="true"><span id="chat-input">${t('Message')}</span><b>↑</b></div>
    </div>
    <div class="convs" role="group" aria-label="${t('Example conversations')}">${chats.map((c, i) => `<button type="button" data-conv="${i}" aria-pressed="${i === 0}">${escape(c.label)}</button>`).join('')}</div>
    <div class="sr-only">${chats.map((c) => `<p>${escape(c.label)}: ${c.messages.map((m) => `${m.who === 'user' ? t('You') : t('Assistant')}: ${escape(m.text)}`).join(' ')}</p>`).join('')}</div>
  </div>
</section>
<section id="how">
  <h2>${t('How it works')}</h2>
  <div class="features">
    <div class="card"><h3>${t('Say it, snap it, forward it')}</h3><p class="small muted">${t('A sentence, a receipt photo, an order email or a bank statement. Your assistant reads it; Kept files it once, even when it arrives three ways.')}</p></div>
    <div class="card"><h3>${t('One question, a good guess')}</h3><p class="small muted">${t('"Groceries, like last Saturday?" Kept tells your assistant when to ask, when to stay quiet, and always to confirm before saving.')}</p></div>
    <div class="card"><h3>${t('See where it goes')}</h3><p class="small muted">${t('Per car, per kid, per month. Ask in the chat, or review and fix everything on the web.')}</p></div>
  </div>
</section>
<section id="privacy">
  <h2>${t('Your data')}</h2>
  <ul class="list">
    <li><strong>${t('Kept never connects to your bank or inbox.')}</strong><div class="small muted">${t('Your assistant reads what you show it; Kept keeps what was logged, not the files.')}</div></li>
    <li><strong>${t('Your purchases are yours.')}</strong><div class="small muted">${t('Others in your household see shared totals, never your list. Private purchases stay out of totals too.')}</div></li>
  </ul>
</section>
<section class="card" id="assistants">
  <h2>${t('Works with the assistant you already use')}</h2>
  <div class="assistants"><span>Claude</span><span>ChatGPT</span><span>Gemini</span></div>
  <p class="muted" style="margin:0">${t('Add Kept to your assistant once and keep chatting as usual. Use more than one, or switch any time: your history and notes stay in Kept.')}</p>
</section>
<footer class="small muted"><span>Kept</span><a href="mailto:support@kept-ledger.com">support@kept-ledger.com</a></footer>
</main>
<script type="application/json" id="chat-data">${chatData(lang)}</script>
<script>${CHAT_SCRIPT}</script>
</body>
</html>`
}
