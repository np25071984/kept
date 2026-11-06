import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LANDING_CSP, landingPage, linkToCode } from '../../src/http/landing.js'
import { landingChart, sampleDay, sampleMonths } from '../../src/http/landingChart.js'
import { chatData, conversations } from '../../src/http/landingChat.js'

const ORIGIN = 'https://kept-ledger.com'

describe('landing page', () => {
  it('renders in the visitor\'s language with the switch set to it', () => {
    const ru = landingPage('ru', ORIGIN)
    expect(ru).toContain('<html lang="ru">')
    expect(ru).toContain('Расскажите ассистенту, что потратили.')
    expect(ru).toContain('value="ru" lang="ru" aria-checked="true"')
    expect(landingPage('en', ORIGIN)).toContain('Tell your assistant what you spent.')
    expect(ru).toContain('По месяцам')
    expect(landingPage('en', ORIGIN)).toContain('<svg class="chart"')
  })

  it('names what Kept is and which assistants it works with, for search results and shared links', () => {
    const en = landingPage('en', ORIGIN)
    expect(en).toContain('<title>Kept: household expense tracker for ChatGPT, Claude and Gemini</title>')
    expect(en).toContain('<link rel="canonical" href="https://kept-ledger.com/">')
    expect(en).toContain('<meta property="og:image" content="https://kept-ledger.com/app/icon-512.png">')
    expect(en).toContain('<h3>How much does it cost?</h3>')
    const ru = landingPage('ru', ORIGIN)
    expect(ru).toContain('<meta property="og:locale" content="ru_RU">')
    expect(ru).toContain('<h3>Сколько это стоит?</h3>')
  })

  it('links open source claims to the code, in every language', () => {
    expect(linkToCode('free and [open source].')).toBe('free and <a href="https://github.com/np25071984/kept">open source</a>.')
    expect(linkToCode('no brackets')).toBe('no brackets')
    expect(landingPage('en', ORIGIN)).toContain('>open source</a>')
    expect(landingPage('en', ORIGIN)).toContain('>The code is open</a>')
    expect(landingPage('ru', ORIGIN)).toContain('>исходный код открыт</a>')
    expect(landingPage('ru', ORIGIN)).toContain('>Код открыт</a>')
    expect(landingPage('en', ORIGIN)).not.toContain('[open source]')
    expect(landingPage('en', ORIGIN)).toContain('<a href="https://github.com/np25071984/kept" class="github" aria-label="Kept on GitHub"')
    expect(landingPage('ru', ORIGIN)).toContain('aria-label="Kept на GitHub"')
  })

  it('allows only its own inline scripts', () => {
    const scripts = [...landingPage('en', ORIGIN).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
    expect(scripts).toHaveLength(2)
    for (const script of scripts) expect(LANDING_CSP).toContain(`'sha256-${createHash('sha256').update(script).digest('base64')}'`)
  })
})

describe('landing chat', () => {
  it('confirms amounts that add up to what was spent', () => {
    const [typed, bank, receipt] = conversations('en')
    expect(typed!.messages[1]!.text).toContain('$22')
    expect(bank!.messages[3]!.text).toContain(`$${(54.2 + 15.49 + 82.15 + 23.4).toFixed(2)}`)
    expect(receipt!.messages[1]!.text).toContain(`$${(86.4 - 18.99 - 7.48).toFixed(2)}`)
  })

  it('translates every line into Russian', () => {
    const english = conversations('en').flatMap((c) => [c.label, ...c.messages.map((m) => m.text)])
    const russian = conversations('ru').flatMap((c) => [c.label, ...c.messages.map((m) => m.text)])
    russian.forEach((text, i) => expect(text).not.toBe(english[i]))
  })

  it('keeps its data from closing the script tag', () => {
    expect(chatData('en')).not.toContain('<')
  })
})

describe('landing chart', () => {
  it('ends the sample in the current month, counted so far', () => {
    const { months, soFar, before } = sampleMonths('2026-11-15')
    expect(months).toHaveLength(12)
    expect(months[0]!.month).toBe('2025-12')
    expect(months.at(-1)).toEqual({ month: '2026-11', amount: soFar })
    expect(soFar).toBe(Math.round((1552.27 * 15) / 30 * 100) / 100)
    expect(before).toBe(Math.round((1688.51 * 15) / 31 * 100) / 100)
  })

  it('draws the first days of a month as the 10th', () => {
    expect(sampleDay('2026-11-01')).toBe('2026-11-10')
    expect(sampleDay('2026-11-09')).toBe('2026-11-10')
    expect(sampleDay('2026-11-10')).toBe('2026-11-10')
    expect(sampleDay('2026-11-30')).toBe('2026-11-30')
    expect(landingChart('en', '2026-11-01')).toMatch(/Oct 1\s–\s10/)
  })

  it('compares with the same days of a shorter month before', () => {
    expect(sampleMonths('2026-03-31').before).toBe(1688.51)
  })

  it('draws both widths with the month names and totals in the visitor\'s language', () => {
    const html = landingChart('ru', '2026-11-15')
    expect(html.match(/<svg class="chart/g)).toHaveLength(2)
    expect(html).toContain('ноябрь на сегодня')
    expect(html).toContain('>нояб.</text>')
    expect(landingChart('en', '2026-11-15')).toContain('November so far')
  })
})
