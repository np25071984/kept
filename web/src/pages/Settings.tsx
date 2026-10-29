import { useState, type FormEvent } from 'react'
import { Outlet } from 'react-router'
import { api } from '../api.js'
import { TimeZoneField } from '../TimeZoneField.js'
import { Tabs } from '../Header.js'
import { useAction, useSession } from '../session.js'

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
  const { setup, refreshVocabulary } = useSession()
  const [name, setName] = useState(setup.you.name)
  const { busy, error, act } = useAction()
  const [saved, setSaved] = useState(false)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    if (await act(() => api.updateMe({ name: name.trim() }))) {
      setSaved(true)
      refreshVocabulary()
    }
  }
  return (
    <form className="section form" onSubmit={save}>
      <p className="muted small">{setup.you.email} · {setup.you.role === 'owner' ? 'Owner' : 'Member'} of {setup.household.name}</p>
      <label>Name<input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} required /></label>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !name.trim() || name.trim() === setup.you.name}>Save</button>
        {saved && <span className="muted small">Saved.</span>}
      </div>
    </form>
  )
}

// Settings → Household → General: the household's name, currency and time zone. Owners change them; members see them.
export function GeneralPage() {
  const { setup, refreshVocabulary } = useSession()
  const owner = setup.you.role === 'owner'
  const [form, setForm] = useState({ name: setup.household.name, currency: setup.household.currency, timezone: setup.household.timezone })
  const { busy, error, act } = useAction()
  const [saved, setSaved] = useState(false)
  const changed = form.name.trim() !== setup.household.name || form.currency !== setup.household.currency || form.timezone !== setup.household.timezone
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    const patch = {
      ...(form.name.trim() !== setup.household.name && { name: form.name.trim() }),
      ...(form.currency !== setup.household.currency && { currency: form.currency }),
      ...(form.timezone !== setup.household.timezone && { timezone: form.timezone }),
    }
    if (await act(() => api.updateSetup(patch))) {
      setSaved(true)
      refreshVocabulary()
    }
  }
  return (
    <form className="section form" onSubmit={save}>
      {!owner && <p className="muted small">Only an owner can change these.</p>}
      <label>Household name<input value={form.name} disabled={!owner} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
      <label>Currency
        <select value={form.currency} disabled={!owner || setup.household.currency_locked} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          {currencies().map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <span className="small muted">{setup.household.currency_locked ? 'Fixed after the first purchase.' : 'Can change until the first purchase.'}</span>
      </label>
      <div className="field">Time zone
        <TimeZoneField value={form.timezone} disabled={!owner} onChange={(timezone) => setForm({ ...form, timezone })} />
        <span className="small muted">"Today", recurring bills and monthly totals follow it, for everyone in the household.</span>
      </div>
      {error && <p className="error">{error}</p>}
      {owner && (
        <div className="row tight">
          <button type="submit" className="primary" disabled={busy || !changed || !form.name.trim()}>Save</button>
          {saved && <span className="muted small">Saved.</span>}
        </div>
      )}
    </form>
  )
}

const currencies = () => Intl.supportedValuesOf('currency')
