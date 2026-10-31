import { Bell, ChevronDown, Menu as MenuIcon } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useSession } from './session.js'
import { t } from './i18n.js'

// The header every signed-in page shares (VISION.md §4.C): pages for looking back, the bell, and the user menu.
// On a phone one ☰ menu holds the pages and the account links instead.
export function Header({ onSignOut }: { onSignOut: () => void }) {
  const { setup, unseen } = useSession()
  const { pathname } = useLocation()
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Menu label={<MenuIcon size={22} aria-hidden="true" />} ariaLabel={t('Menu')} className="phonemenu" active={false} align="left">
          <NavLink to="/purchases">{t('My purchases')}</NavLink>
          <NavLink to="/recurring">{t('Recurring')}</NavLink>
          <span className="menu-heading">{t('Reports')}</span>
          <NavLink to="/reports/mine" end={false} className="indent">{t('Mine')}</NavLink>
          <NavLink to="/reports/household" end={false} className="indent">{t('Household')}</NavLink>
          <hr />
          <NavLink to="/preferences">{t('Preferences')}</NavLink>
          <span className="menu-heading">{t('Settings')}</span>
          {settingsPages().map((page) => <NavLink key={page.to} to={page.to} end={page.end ?? true} className="indent">{page.label}</NavLink>)}
          <hr />
          <button type="button" onClick={onSignOut}>{t('Sign out')} · {setup.you.name}</button>
        </Menu>
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
function Menu({ label, ariaLabel, className, active, align, children }: { label: ReactNode; ariaLabel?: string; className: string; active: boolean; align: 'left' | 'right'; children: ReactNode }) {
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
      <summary aria-label={ariaLabel}>{label}{typeof label === 'string' && <ChevronDown size={14} aria-hidden="true" />}</summary>
      <div className={`menu menu-${align}`}>{children}</div>
    </details>
  )
}

// The Settings pages: tabs on a wide screen, entries in the ☰ menu on a phone.
export const settingsPages = () => [
  { to: '/settings/profile', label: t('Profile') },
  { to: '/settings/household', label: t('Household'), end: false },
  { to: '/settings/assistants', label: t('Assistants & keys') },
  { to: '/settings/notes', label: t('Assistant notes') },
]

// Segmented tabs whose tab is in the URL, so links and Back work.
export function Tabs({ items, className = '' }: { items: { to: string; label: string; end?: boolean }[]; className?: string }) {
  return (
    <nav className={`segmented tabs ${className}`}>
      {items.map((item) => <NavLink key={item.to} to={item.to} end={item.end ?? true}>{item.label}</NavLink>)}
    </nav>
  )
}
