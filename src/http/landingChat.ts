import type { Language } from '../domain/language.js'
import { tr } from '../i18n.js'

// The landing page's animated chat (VISION.md §4.C): three conversations take turns, the way people log with Kept.
// The user's text types into the input; the assistant shows a typing indicator before each reply. With reduced
// motion, a picked conversation shows finished. It pauses while the phone is off screen.
// Each reply follows the playbook: best guess, confirm, one-line result.

export interface Shot {
  kind: 'bank' | 'receipt'
  title: string
  rows: string[][]
  total?: string
}

export interface ChatMessage {
  who: 'user' | 'ai'
  text: string
  time: string
  attach?: Shot
}

export interface Conversation {
  label: string
  messages: ChatMessage[]
}

export function conversations(lang: Language): Conversation[] {
  const t = (text: string) => tr(lang, text)
  const day = (d: number) => new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2026, 9, d))
  return [
    {
      label: t('Text or voice'),
      messages: [
        { who: 'user', time: '8:14', text: t("I just spent $60 at Target. $11 on bath curtains, $22 sneakers for Zoe, the rest is groceries") },
        { who: 'ai', time: '8:14', text: t('Log $60 at Target, today?\nClothing $22 for Zoe\nHome $11, bath curtains\nGroceries $27') },
        { who: 'user', time: '8:15', text: t('Yes') },
        { who: 'ai', time: '8:15', text: t('Logged $60.00 at Target.') },
      ],
    },
    {
      label: t('Bank screenshot'),
      messages: [
        {
          who: 'user', time: '12:40', text: t('Log all my spending after Oct 17'),
          attach: {
            kind: 'bank', title: t('Card ••4417'),
            rows: [
              [day(21), 'SQ *BLUE BTL 0423', '−23.40'],
              [day(20), "TRADER JOE'S #552", '−82.15'],
              [day(19), 'NETFLIX.COM', '−15.49'],
              [day(19), 'SHELL OIL 5741', '−54.20'],
              [day(18), 'TARGET 00012', '−60.00'],
              [day(18), 'GEICO *AUTO', '−900.00'],
              [day(16), 'AMAZON MKTP', '−34.99'],
            ],
          },
        },
        { who: 'ai', time: '12:40', text: t('6 charges after October 17. Target and Geico are already in Kept. Log these 4?\nShell $54.20, fuel for the Kia\nNetflix $15.49\nTrader Joe\'s $82.15, groceries\nBlue Bottle $23.40, coffee') },
        { who: 'user', time: '12:41', text: t('Yes') },
        { who: 'ai', time: '12:41', text: t('Logged 4 purchases, $175.24.') },
      ],
    },
    {
      label: t('Receipt photo'),
      messages: [
        {
          who: 'user', time: '18:05', text: t('Scan this receipt and log everything'),
          attach: {
            kind: 'receipt', title: 'WHOLE FOODS',
            rows: [['ORG BANANAS', '1.99'], ['KETTLE CHIPS', '3.49'], ['CAB SAUV 750ML', '18.99'], ['CHOC COOKIES', '3.99'], ['MILK 2% 1GAL', '4.29'], ['…', '']],
            total: '86.40',
          },
        },
        { who: 'ai', time: '18:05', text: t("Whole Foods, $86.40. You're watching alcohol and snacks: I found $18.99 of wine and $7.48 of snacks. Log it?\nAlcohol $18.99\nSnacks $7.48\nGroceries $59.93") },
        { who: 'user', time: '18:06', text: t('Yes') },
        { who: 'ai', time: '18:06', text: t('Logged $86.40 at Whole Foods, with $18.99 of alcohol and $7.48 of snacks.') },
      ],
    },
  ]
}

// Data in a non-executing script block; "<" escaped so no text can close the tag.
export function chatData(lang: Language): string {
  return JSON.stringify({ today: tr(lang, 'Today'), conversations: conversations(lang) }).replace(/</g, '\\u003c')
}

export const CHAT_SCRIPT = `(() => {
  const data = JSON.parse(document.getElementById('chat-data').textContent)
  const chat = document.getElementById('chat')
  const input = document.getElementById('chat-input')
  const tabs = [...document.querySelectorAll('[data-conv]')]
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const placeholder = input.textContent
  let run = 0
  // Paused while the phone is off screen, so nothing moves while the visitor reads the rest of the page.
  let shown = true
  let resume = null
  new IntersectionObserver(([entry]) => {
    shown = entry.isIntersecting
    if (shown && resume) resume()
  }).observe(chat)
  const onScreen = () => (shown ? Promise.resolve() : new Promise((resolve) => (resume = resolve)))
  const wait = (ms, id) => new Promise((resolve) => setTimeout(resolve, ms)).then(onScreen).then(() => {
    if (id !== run) throw new Error('replaced')
  })
  const el = (tag, cls, text) => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }
  const shot = (a) => {
    const box = el('div', 'shot ' + a.kind)
    box.append(el('div', 'shot-title', a.title))
    for (const row of a.rows) {
      const line = el('div', 'shot-row')
      for (const cell of row) line.append(el('span', '', cell))
      box.append(line)
    }
    if (a.total) {
      const line = el('div', 'shot-row shot-total')
      line.append(el('span', '', 'TOTAL'), el('span', '', a.total))
      box.append(line)
    }
    return box
  }
  const bubble = (m) => {
    const b = el('div', 'bubble ' + m.who)
    if (m.attach) b.append(shot(m.attach))
    b.append(el('div', 'text', m.text), el('span', 'time', m.time))
    return b
  }
  const open = (i) => {
    tabs.forEach((tab, j) => tab.setAttribute('aria-pressed', String(i === j)))
    chat.replaceChildren(el('div', 'day', data.today))
  }
  const play = async (i, id) => {
    open(i)
    for (const m of data.conversations[i].messages) {
      await wait(m.who === 'user' ? 900 : 500, id)
      if (m.who === 'user' && !m.attach) {
        input.classList.add('typed')
        for (let n = 1; n <= m.text.length; n++) {
          input.textContent = m.text.slice(0, n)
          await wait(24, id)
        }
        await wait(350, id)
        input.textContent = placeholder
        input.classList.remove('typed')
      }
      if (m.who === 'ai') {
        const dots = el('div', 'bubble ai typing')
        dots.append(el('span'), el('span'), el('span'))
        chat.append(dots)
        await wait(1300, id)
        dots.remove()
      }
      chat.append(bubble(m))
    }
    await wait(5000, id)
    return play((i + 1) % data.conversations.length, id)
  }
  const start = (i) => {
    const id = ++run
    input.textContent = placeholder
    input.classList.remove('typed')
    if (!still) return play(i, id).catch(() => {})
    open(i)
    for (const m of data.conversations[i].messages) chat.append(bubble(m))
  }
  tabs.forEach((tab, i) => tab.addEventListener('click', () => start(i)))
  start(0)
})()`

export const CHAT_STYLE = `
.chat { display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; height: 440px; overflow: hidden; padding: 14px 12px; background-color: var(--chat-bg); background-image: radial-gradient(var(--chat-dot) 1px, transparent 1px); background-size: 14px 14px; }
.chat > * { flex-shrink: 0; }
.day { align-self: center; font-size: 11px; color: var(--muted); background: var(--surface); padding: 2px 10px; border-radius: 10px; margin-bottom: 4px; }
.bubble { max-width: 82%; padding: 7px 10px 5px; border-radius: 14px; font-size: 14px; line-height: 1.35; box-shadow: 0 1px 1px rgb(0 0 0 / 0.08); }
.bubble .text { white-space: pre-line; }
.bubble .time { display: block; text-align: right; font-size: 10px; opacity: 0.6; margin-top: 2px; }
.bubble.user { align-self: flex-end; background: var(--chat-out); border-bottom-right-radius: 4px; }
.bubble.ai { align-self: flex-start; background: var(--surface); border-bottom-left-radius: 4px; }
.bubble.typing { display: flex; gap: 4px; padding: 12px 14px; }
.bubble.typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: blink 1.2s infinite; }
.bubble.typing span:nth-child(2) { animation-delay: 0.2s; }
.bubble.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }
.chat .bubble { animation: rise 0.25s ease-out; }
@media (prefers-reduced-motion: reduce) { .chat .bubble { animation: none; } }
.shot { margin: -2px -4px 6px; padding: 8px 9px; border-radius: 9px; font: 10px/1.45 ui-monospace, monospace; display: grid; gap: 1px; }
.shot-row { display: flex; gap: 8px; }
.shot-row span:nth-child(2) { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.shot-row span:last-child { text-align: right; }
.shot.receipt .shot-row span:first-child { flex: 1; }
.shot-title { font-weight: 700; margin-bottom: 3px; }
.shot.bank { background: #fff; color: #1d2b4a; border: 1px solid #d6dbe6; }
.shot.bank .shot-title { color: #2453a6; }
.shot.receipt { background: #fffef8; color: #333; border: 1px solid #e4e0d0; text-align: left; }
.shot.receipt .shot-title { text-align: center; }
.shot-total { border-top: 1px dashed #999; margin-top: 3px; padding-top: 3px; font-weight: 700; }
/* One line, like a messenger's input before it wraps: while typing, the text runs off to the left. */
.phone-input span { display: flex; white-space: nowrap; overflow: hidden; transition: color 0.2s; }
.phone-input span.typed { justify-content: flex-end; color: var(--fg); }
.convs { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.convs button { font: inherit; font-size: 12px; padding: 4px 9px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); cursor: pointer; }
.convs button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`
