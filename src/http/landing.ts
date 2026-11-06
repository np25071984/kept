import { createHash } from 'node:crypto'
import type { Language } from '../domain/language.js'
import { tr } from '../i18n.js'
import { escape } from '../oauth/pages.js'
import { siteHeader } from './siteHeader.js'
import { landingChart } from './landingChart.js'
import { CHAT_SCRIPT, CHAT_STYLE, chatData, conversations } from './landingChat.js'

// The page at / (VISION.md §4.C): what Kept is, what happens to the data, which assistants it works with.
// Plain server-rendered HTML with no tracking; the only cookie is the language the switch sets.

// A visitor already signed in on this browser goes straight to the app.
const SCRIPT = "try { if (localStorage.getItem('kept.refresh_token')) location.replace('/app/') } catch {}"

const REPOSITORY = 'https://github.com/np25071984/kept'
const GITHUB_ICON = '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>'

// Turns [words] in already escaped text into a link to the code.
export const linkToCode = (escaped: string) => escaped.replace(/\[([^\]]+)\]/g, `<a href="${REPOSITORY}">$1</a>`)

// Questions people search for, answered in a line or two. [Words] link to the code.
const FAQ: [string, string][] = [
  ["Can ChatGPT track my expenses?", "On its own, it forgets last week's purchases and files the same store differently each time. With Kept connected, it logs each purchase to your household's ledger once you confirm it, and answers questions like “How much on groceries this month?”"],
  ["Can my partner and I track spending together?", "Yes. Each of you signs in with your own email and uses your own assistant. You share categories and household totals; each person's purchases stay theirs, and private ones stay out of the totals."],
  ["How much does it cost?", "Kept is free and [open source]. Some assistants need a paid plan to add it."],
  ["How can I see my spending?", "Ask your assistant, or sign in to Kept on the web and open Reports, where you can see your own spending or the whole household's."],
  ["Why can I trust Kept with my private data?", "Kept has no ads or analytics and doesn't sell your data. [The code is open], so you can check it, or run Kept on your own server and use it the same way. Your assistant is a separate service, so what you tell it is covered by its maker's privacy policy."],
]

const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'

const hash = (script: string) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`

export const LANDING_CSP = `default-src 'none'; style-src 'self' 'unsafe-inline'; script-src ${hash(SCRIPT)} ${hash(CHAT_SCRIPT)}; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`

// What only this page needs; the palette, header and menus come from /app/site.css.
const STYLE = `
:root { --chat-bg: #ece5dc; --chat-dot: #ddd3c6; --chat-out: #d9f2dc; }
@media (prefers-color-scheme: dark) { :root { --chat-bg: #12100e; --chat-dot: #1f1c18; --chat-out: #1f3a2c; } }
h2 { margin: 0 0 12px; }
h3 { font-size: 14px; margin: 0 0 6px; }
.topbar nav { flex-wrap: wrap; }
.topbar nav a { white-space: nowrap; }
@media (max-width: 720px) { .topbar nav { order: 3; flex-basis: 100%; } }
main { max-width: 960px; margin: 0 auto; padding: 24px 16px 48px; }
section { margin-bottom: 28px; }
.points { list-style: none; padding: 0; margin: 20px 0 0; display: grid; gap: 10px; }
.points li { display: flex; gap: 10px; align-items: flex-start; }
.points svg { flex-shrink: 0; margin-top: 3px; color: var(--accent); }
.hero h1 { font-size: 30px; line-height: 1.2; margin: 0 0 10px; }
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
.list h3 { font-size: inherit; margin: 0 0 2px; }
.chart-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px; }
.chart-totals { text-align: right; }
.num { font-variant-numeric: tabular-nums; }
.defs { position: absolute; }
.months-6 { display: none; }
@media (max-width: 600px) { .months-12 { display: none; } .months-6 { display: block; } }
/* Anchored sections clear the sticky header. */
section[id] { scroll-margin-top: 72px; }
@media (max-width: 720px) { section[id] { scroll-margin-top: 150px; } }
footer { border-top: 1px solid var(--line); margin-top: 32px; padding-top: 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
footer .github { display: inline-flex; }
`


// `today` is the server's date (UTC): the chart's sample ends in the current month.
// `origin` is the public address, for the canonical link and the preview card that chat apps show for a shared link.
export function landingPage(lang: Language, origin: string, today = new Date().toISOString().slice(0, 10)): string {
  const t = (text: string) => escape(tr(lang, text))
  const chats = conversations(lang)
  const first = chats[0]!
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t('Kept: household expense tracker for ChatGPT, Claude and Gemini')}</title>
<meta name="description" content="${t('Track household expenses by chatting with ChatGPT, Claude or Gemini. Kept files each purchase and shows where the money goes. No forms, no bank logins.')}">
<link rel="canonical" href="${origin}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Kept">
<meta property="og:url" content="${origin}/">
<meta property="og:title" content="${t('Kept: household expense tracker for ChatGPT, Claude and Gemini')}">
<meta property="og:description" content="${t('Track household expenses by chatting with ChatGPT, Claude or Gemini. Kept files each purchase and shows where the money goes. No forms, no bank logins.')}">
<meta property="og:image" content="${origin}/app/icon-512.png">
<meta property="og:locale" content="${lang === 'ru' ? 'ru_RU' : 'en_US'}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/app/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/app/apple-touch-icon.png">
<link rel="stylesheet" href="/app/site.css">
<script>${SCRIPT}</script>
<style>${STYLE}${CHAT_STYLE}</style>
</head>
<body>
${siteHeader(lang, {
  nav: `<a href="#how">${t('How it works')}</a><a href="#privacy">${t('Your data')}</a><a href="#assistants">${t('Assistants')}</a>`,
  end: `<a href="/app/">${t('Sign in')}</a>`,
})}
<main>
<section class="hero">
  <div>
    <h1>${t('Tell your assistant what you spent. Kept keeps the books.')}</h1>
    <p class="muted">${t('Kept is a household expense tracker that lives in the AI you already use: it knows what to ask, how to file it, and what to remember.')}</p>
    <ul class="points">
      ${[
        ['No new AI to learn.', 'Kept works inside the assistant you already use: Claude, ChatGPT or Gemini.'],
        ['No new app on your phone.', 'Your assistant\'s app is all you need.'],
        ['Track spending on the go.', 'A quick chat at the checkout, like telling a friend.'],
        ['No bookkeeping chores.', 'Your assistant handles the routine, so you can get on with your day.'],
      ].map(([head, line]) => `<li>${CHECK}<span><strong>${t(head!)}</strong> ${t(line!)}</span></li>`).join('')}
    </ul>
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
<section id="watch">
  <h2>${t('Know what you spent on, without logging every item')}</h2>
  <p class="muted" style="margin:0">${t('Most trackers make you choose: enter every item, or log only categories and never find out what the green peas cost. With Kept, your assistant does the logging. Decide what to watch, and Kept tracks only those details, keeping the rest by category.')}</p>
</section>
<section id="reports">
  <h2>${t('Where the money goes, month by month')}</h2>
  ${landingChart(lang, today)}
</section>
<section id="privacy">
  <h2>${t('Your data')}</h2>
  <ul class="list">
    <li><strong>${t('Kept never connects to your bank or inbox.')}</strong><div class="small muted">${t('Your assistant reads what you show it; Kept keeps what was logged, not the files.')}</div></li>
    <li><strong>${t('Your purchases are yours.')}</strong><div class="small muted">${t('Others in your household see shared totals, never your list. Private purchases stay out of totals too.')}</div></li>
    <li><strong>${t('Your data isn\'t locked in.')}</strong><div class="small muted">${t('Download your purchases, notes and the rest at any time, as JSON or as a CSV for spreadsheets.')}</div></li>
  </ul>
</section>
<section id="assistants">
  <h2>${t('Track expenses in ChatGPT, Claude, Gemini and others')}</h2>
  <p class="muted" style="margin:0">${t('Kept works with any assistant that lets you add a custom connector (a remote MCP server). Add Kept once in its settings on the web and keep chatting as usual; ChatGPT needs Developer Mode, mostly on paid plans. Use more than one, or switch any time: your history and notes stay in Kept. Once you sign in, Kept shows how to connect your assistant.')}</p>
</section>
<section id="faq">
  <h2>${t('Questions')}</h2>
  <ul class="list">
    ${FAQ.map(([question, answer]) => `<li><h3>${t(question)}</h3><div class="small muted">${linkToCode(t(answer))}</div></li>`).join('')}
  </ul>
</section>
<footer class="small muted"><span>Kept</span><a href="mailto:support@kept-ledger.com">support@kept-ledger.com</a><a href="${REPOSITORY}" class="github" aria-label="${t('Kept on GitHub')}" title="${t('Kept on GitHub')}">${GITHUB_ICON}</a></footer>
</main>
<script type="application/json" id="chat-data">${chatData(lang)}</script>
<script>${CHAT_SCRIPT}</script>
</body>
</html>`
}
