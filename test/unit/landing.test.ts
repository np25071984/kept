import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LANDING_CSP, landingPage } from '../../src/http/landing.js'
import { landingChart, sampleDay, sampleMonths } from '../../src/http/landingChart.js'
import { chatData, conversations } from '../../src/http/landingChat.js'

describe('landing page', () => {
  it('renders in the visitor\'s language with the switch set to it', () => {
    const ru = landingPage('ru')
    expect(ru).toContain('<html lang="ru">')
    expect(ru).toContain('Расскажите ассистенту, что потратили.')
    expect(ru).toContain('value="ru" lang="ru" aria-checked="true"')
    expect(landingPage('en')).toContain('Tell your assistant what you spent.')
    expect(ru).toContain('По месяцам')
    expect(landingPage('en')).toContain('<svg class="chart"')
  })

  it('allows only its own inline scripts', () => {
    const scripts = [...landingPage('en').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
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
    expect(html.match(/<svg class="chart"/g)).toHaveLength(2)
    expect(html).toContain('ноябрь на сегодня')
    expect(html).toContain('>нояб.</text>')
    expect(landingChart('en', '2026-11-15')).toContain('November so far')
  })
})
