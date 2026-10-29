import { Outlet } from 'react-router'
import { Tabs } from '../Header.js'
import { useSession } from '../session.js'

// Settings, from the user menu: tabs for the member, the household, assistants and notes (VISION.md §4.C).
export function SettingsLayout() {
  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <Tabs items={[
        { to: '/settings/profile', label: 'Profile' },
        { to: '/settings/household', label: 'Household', end: false },
        { to: '/settings/assistants', label: 'Assistants & keys' },
        { to: '/settings/notes', label: 'Assistant notes' },
      ]} />
      <Outlet />
    </>
  )
}

export function HouseholdLayout() {
  return (
    <>
      <Tabs className="subtabs" items={[
        { to: '/settings/household/members', label: 'Members' },
        { to: '/settings/household/categories', label: 'Categories' },
        { to: '/settings/household/people', label: 'People & things' },
        { to: '/settings/household/general', label: 'General' },
      ]} />
      <Outlet />
    </>
  )
}

export function ProfilePage() {
  const { setup } = useSession()
  return (
    <section className="section">
      <p className="muted small">{setup.you.email} · {setup.you.role === 'owner' ? 'Owner' : 'Member'} of {setup.household.name}</p>
    </section>
  )
}
