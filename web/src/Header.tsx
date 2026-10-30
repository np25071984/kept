import { Bell, ChevronDown, Globe } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useSession } from './session.js'
import { api } from './api.js'
import { language, setLanguage, t, type Language } from './i18n.js'

// The header every signed-in page shares (VISION.md §4.C): pages for looking back, the bell, and the user menu.
export function Header({ onSignOut }: { onSignOut: () => void }) {
  const { setup, unseen } = useSession()
  const { pathname } = useLocation()
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* Outside the app's routes, so a plain link: / sends a signed-in browser back to My purchases. */}
        <a className="brand" href="/"><img src="/app/icon.svg" width="22" height="22" alt="" />Kept</a>
        <nav>
          <NavLink to="/purchases">{t('My purchases')}</NavLink>
          <NavLink to="/recurring">{t('Recurring')}</NavLink>
          <Menu label={t('Reports')} className="navmenu" active={pathname.startsWith('/reports')} align="left">
            <NavLink to="/reports/mine" end={false}>{t('Mine')}</NavLink>
            <NavLink to="/reports/household" end={false}>{t('Household')}</NavLink>
          </Menu>
        </nav>
        <div className="right">
          <LanguageMenu />
          <NavLink to="/notifications" className="bell" aria-label={unseen ? t('Notifications: {n} waiting', { n: unseen }) : t('Notifications')} title={t('Notifications')}>
            <Bell size={18} aria-hidden="true" />
            {unseen > 0 && <span className="badge">{unseen}</span>}
          </NavLink>
          <Menu label={setup.you.name} className="usermenu" active={pathname.startsWith('/settings') || pathname.startsWith('/preferences')} align="right">
            <NavLink to="/preferences">{t('Preferences')}</NavLink>
            <NavLink to="/settings" end={false}>{t('Settings')}</NavLink>
            <hr />
            <button type="button" onClick={onSignOut}>{t('Sign out')}</button>
          </Menu>
        </div>
      </div>
    </header>
  )
}

// A <details> dropdown that closes on a click elsewhere, on Escape and when the page changes.
function Menu({ label, className, active, align, children }: { label: string; className: string; active: boolean; align: 'left' | 'right'; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    if (ref.current) ref.current.open = false
  }, [pathname])
  useEffect(() => {
    const close = (event: Event) => {
      const menu = ref.current
      if (!menu?.open) return
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menu.contains(event.target as Node)) menu.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [])
  return (
    <details ref={ref} className={`${className}${active ? ' active' : ''}`}>
      <summary>{label}<ChevronDown size={14} aria-hidden="true" /></summary>
      <div className={`menu menu-${align}`}>{children}</div>
    </details>
  )
}

// The language menu (VISION.md §4.C): saved to the account, so emails follow it too.
function LanguageMenu() {
  const ref = useRef<HTMLDetailsElement>(null)
  const pick = async (lang: Language) => {
    if (ref.current) ref.current.open = false
    if (lang === language()) return
    setLanguage(lang)
    await api.updateMe({ language: lang }).catch(() => undefined)
    location.reload()
  }
  return (
    <details ref={ref} className="langmenu">
      <summary aria-label={t('Language')}><Globe size={18} aria-hidden="true" /><span className="code">{language().toUpperCase()}</span></summary>
      <div className="menu menu-right" role="menu">
        {([['en', 'English'], ['ru', 'Русский']] as const).map(([code, name]) => (
          <button key={code} type="button" role="menuitemradio" lang={code} aria-checked={language() === code} onClick={() => void pick(code)}>{name}</button>
        ))}
      </div>
    </details>
  )
}

// Segmented tabs whose tab is in the URL, so links and Back work.
export function Tabs({ items, className = '' }: { items: { to: string; label: string; end?: boolean }[]; className?: string }) {
  return (
    <nav className={`segmented tabs ${className}`}>
      {items.map((item) => <NavLink key={item.to} to={item.to} end={item.end ?? true}>{item.label}</NavLink>)}
    </nav>
  )
}
