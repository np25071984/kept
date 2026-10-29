import type { Language } from '../domain/language.js'
import { tr } from '../i18n.js'

// The header of the server-rendered pages, styled by /app/site.css like the web app's: the logo, optional links,
// and the language menu, a POST to /language that returns to the page.

const GLOBE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'

// `nav` and `end` are trusted HTML built by the caller.
export function siteHeader(lang: Language, parts: { nav?: string; end?: string } = {}): string {
  const option = (code: Language, name: string) => `<button type="submit" role="menuitemradio" name="lang" value="${code}" lang="${code}" aria-checked="${lang === code}">${name}</button>`
  return `<header class="topbar"><div class="topbar-inner">
  <a class="brand" href="/"><img src="/app/icon.svg" width="22" height="22" alt="">Kept</a>
  ${parts.nav ? `<nav>${parts.nav}</nav>` : ''}
  <div class="right">
    <details class="langmenu"><summary aria-label="${tr(lang, 'Language')}">${GLOBE}<span class="code">${lang.toUpperCase()}</span></summary><form class="menu menu-right" method="post" action="/language" role="menu">${option('en', 'English')}${option('ru', 'Русский')}</form></details>
    ${parts.end ?? ''}
  </div>
</div></header>`
}
