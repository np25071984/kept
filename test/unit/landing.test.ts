import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LANDING_CSP, landingPage } from '../../src/http/landing.js'

describe('landing page', () => {
  it('renders in the visitor\'s language with the switch set to it', () => {
    const ru = landingPage('ru')
    expect(ru).toContain('<html lang="ru">')
    expect(ru).toContain('Расскажите ассистенту, что потратили.')
    expect(ru).toContain('value="ru" lang="ru" aria-checked="true"')
    expect(landingPage('en')).toContain('Tell your assistant what you spent.')
  })

  it('allows only its own inline script', () => {
    const script = landingPage('en').match(/<script>(.*)<\/script>/)![1]!
    expect(LANDING_CSP).toContain(`'sha256-${createHash('sha256').update(script).digest('base64')}'`)
  })
})
