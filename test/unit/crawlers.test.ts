import { describe, expect, it } from 'vitest'
import { robotsTxt, sitemapXml } from '../../src/domain/crawlers.js'

describe('robotsTxt', () => {
  const robots = robotsTxt('https://kept-ledger.com')

  it('points to the sitemap at the public address', () => {
    expect(robots).toContain('Sitemap: https://kept-ledger.com/sitemap.xml')
  })

  it('keeps crawlers out of the app, sign-in and API, but lets them render the landing page', () => {
    for (const path of ['/app/', '/oauth/', '/api/', '/mcp']) expect(robots).toContain(`Disallow: ${path}`)
    for (const path of ['/$', '/app/site.css', '/app/icon.svg']) expect(robots).toContain(`Allow: ${path}`)
  })
})

describe('sitemapXml', () => {
  it('lists the landing page', () => {
    expect(sitemapXml('https://kept-ledger.com')).toContain('<loc>https://kept-ledger.com/</loc>')
  })
})
