import { useEffect, useState, type FormEvent } from 'react'
import { Outlet, useLocation } from 'react-router'
import { api } from '../api.js'
import { CategoriesSection, PeopleSection } from './Household.js'
import { MembersSection } from './Members.js'
import { CurrencyField, TimeZoneField } from '../PickerFields.js'
import { settingsPages, Tabs } from '../Header.js'
import { useAction, useSession } from '../session.js'
import { language, LANGUAGES, setLanguage, t, type Language } from '../i18n.js'

// Settings, from the user menu: tabs for the member, the household, assistants and notes (VISION.md §4.C).
// On a phone the ☰ menu picks the page, so the title names it instead of the tabs.
export function SettingsLayout() {
  const { pathname } = useLocation()
  const pages = settingsPages()
  const current = pages.find((page) => pathname.startsWith(page.to))
  return (
    <>
      <div className="page-head"><h1>{t('Settings')}{current && <span className="phone-only"> · {current.label}</span>}</h1></div>
      <Tabs items={pages} className="settings-tabs" />
      <Outlet />
    </>
  )
}

// Settings → Household: one page, the short sections first. The old sub-tab addresses land on their section.
export function HouseholdPage() {
  const { hash } = useLocation()
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView() }, [hash])
  return (
    <>
      <GeneralSection />
      <MembersSection />
      <PeopleSection />
      <CategoriesSection />
    </>
  )
}

export function ProfilePage() {
  const { setup, refreshVocabulary } = useSession()
  const [name, setName] = useState(setup.you.name)
  const [lang, setLang] = useState(language())
  const { busy, error, act } = useAction()
  const [saved, setSaved] = useState(false)
  const unchanged = name.trim() === setup.you.name && lang === language()
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    if (!(await act(() => api.updateMe({ name: name.trim(), language: lang })))) return
    // The language is saved to the account, so emails follow it too; the page reloads to redraw in it.
    if (lang !== language()) {
      setLanguage(lang)
      location.reload()
      return
    }
    setSaved(true)
    refreshVocabulary()
  }
  return (
    <form className="section form" onSubmit={save}>
      <p className="muted small">{t('{email} · {role} of {household}', { email: setup.you.email, role: t(setup.you.role === 'owner' ? 'Owner' : 'Member'), household: setup.household.name })}</p>
      <label>{t('Name')}<input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} required /></label>
      <label>{t('Language')}
        <select value={lang} onChange={(e) => { setLang(e.target.value as Language); setSaved(false) }}>
          {LANGUAGES.map(([code, label]) => <option key={code} value={code} lang={code}>{label}</option>)}
        </select>
        <span className="small">{t('For the web app and the emails Kept sends you.')}</span>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !name.trim() || unchanged}>{t('Save')}</button>
        {saved && <span className="muted small">{t('Saved.')}</span>}
      </div>
    </form>
  )
}

// Settings → Household → General: the household's name, currency and time zone. Owners change them; members see them.
export function GeneralSection() {
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
    <form className="section form" id="general" onSubmit={save}>
      <h2>{t('General')}</h2>
      {!owner && <p className="muted small">{t('Only an owner can change these.')}</p>}
      <label>{t('Household name')}<input value={form.name} disabled={!owner} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
      <div className="field">{t('Currency')}
        <CurrencyField value={form.currency} disabled={!owner || setup.household.currency_locked} onChange={(currency) => setForm({ ...form, currency })} />
        <span className="small muted">{t(setup.household.currency_locked ? 'Fixed after the first purchase.' : 'Can change until the first purchase.')}</span>
      </div>
      <div className="field">{t('Time zone')}
        <TimeZoneField value={form.timezone} disabled={!owner} onChange={(timezone) => setForm({ ...form, timezone })} />
        <span className="small muted">{t('"Today", recurring bills and monthly totals follow it, for everyone in the household.')}</span>
      </div>
      {error && <p className="error">{error}</p>}
      {owner && (
        <div className="row tight">
          <button type="submit" className="primary" disabled={busy || !changed || !form.name.trim()}>{t('Save')}</button>
          {saved && <span className="muted small">{t('Saved.')}</span>}
        </div>
      )}
    </form>
  )
}

