import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LANDING_CSP, landingPage } from '../../src/http/landing.js'
import { chatData, conversations } from '../../src/http/landingChat.js'

describe('landing page', () => {
  it('renders in the visitor\'s language with the switch set to it', () => {
    const ru = landingPage('ru')
    expect(ru).toContain('<html lang="ru">')
    expect(ru).toContain('Расскажите ассистенту, что потратили.')
    expect(ru).toContain('value="ru" lang="ru" aria-checked="true"')
    expect(landingPage('en')).toContain('Tell your assistant what you spent.')
    expect(ru).toContain('/app/landing/chart-ru-dark-narrow.png')
    expect(landingPage('en')).toContain('<img src="/app/landing/chart-en-light.png"')
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
