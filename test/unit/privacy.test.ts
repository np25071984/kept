import { describe, expect, it } from 'vitest'
import { tr } from '../../src/i18n.js'
import { landingPage } from '../../src/http/landing.js'
import { PRIVACY_CSP, PRIVACY_SECTIONS, privacyPage } from '../../src/http/privacy.js'
import { emailPage } from '../../src/oauth/pages.js'

const ORIGIN = 'https://kept-ledger.com'

describe('privacyPage', () => {
  it('covers each section in both languages', () => {
    for (const [heading, text] of PRIVACY_SECTIONS) {
      expect(tr('ru', heading)).not.toBe(heading)
      expect(tr('ru', text)).not.toBe(text)
    }
    expect(privacyPage('en', ORIGIN)).toContain('<h2>Who else handles it</h2>')
    expect(privacyPage('ru', ORIGIN)).toContain('<html lang="ru">')
  })

  it('makes the support address a link and shows the date', () => {
    const page = privacyPage('en', ORIGIN)
    expect(page).toContain('<a href="mailto:support@kept-ledger.com">support@kept-ledger.com</a>')
    expect(page).toContain('Last updated November 6, 2026')
  })

  it('runs no scripts', () => {
    expect(privacyPage('en', ORIGIN)).not.toContain('<script')
    expect(PRIVACY_CSP).not.toContain('script-src')
  })

  it('is linked from the landing page and the sign-in page', () => {
    expect(landingPage('en', ORIGIN)).toContain('<a href="/privacy">Privacy</a>')
    expect(emailPage('en', 'uid', null)).toContain('<a href="/privacy">Privacy</a>')
  })
})
