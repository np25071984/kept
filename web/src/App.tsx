import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import { api } from './api.js'
import { completeSignIn, hasSession, signIn, signOut } from './auth.js'
import { Header } from './Header.js'
import { AssistantsPage } from './pages/Assistants.js'
import { NotesSection } from './pages/Memory.js'
import { PreferencesPage } from './pages/Preferences.js'
import { PurchasePage } from './pages/Purchase.js'
import { PurchasesPage } from './pages/Purchases.js'
import { RecurringPage } from './pages/Recurring.js'
import { ReportsPage } from './pages/Reports.js'
import { HouseholdPage, ProfilePage, SettingsLayout } from './pages/Settings.js'
import { NotificationsPage } from './pages/Notifications.js'
import { messageFor, SessionContext, SIGNED_OUT, useLoad, type Session } from './session.js'
import { language, setLanguage, t } from './i18n.js'

export function App() {
  return (
    <BrowserRouter basename="/app">
      <Routes>
        <Route path="callback" element={<Callback />} />
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/purchases" replace />} />
          <Route path="purchases" element={<PurchasesPage />} />
          <Route path="purchases/:id" element={<PurchasePage />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="reports" element={<Navigate to="/reports/mine" replace />} />
          <Route path="reports/mine" element={<ReportsPage scope="me" tab="category" />} />
          <Route path="reports/mine/people" element={<ReportsPage scope="me" tab="people" />} />
          <Route path="reports/mine/merchants" element={<ReportsPage scope="me" tab="merchants" />} />
          <Route path="reports/household" element={<ReportsPage scope="household" tab="category" />} />
          <Route path="reports/household/people" element={<ReportsPage scope="household" tab="people" />} />
          <Route path="reports/household/merchants" element={<ReportsPage scope="household" tab="merchants" />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="preferences" element={<PreferencesPage />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="household" element={<HouseholdPage />} />
            {['general', 'members', 'people', 'categories'].map((section) => (
              <Route key={section} path={`household/${section}`} element={<Navigate to={`/settings/household#${section}`} replace />} />
            ))}
            <Route path="assistants" element={<AssistantsPage />} />
            <Route path="notes" element={<NotesSection />} />
          </Route>
          {/* Addresses from before the settings pages. */}
          <Route path="updates" element={<Navigate to="/notifications" replace />} />
          <Route path="household" element={<Navigate to="/settings/household" replace />} />
          <Route path="me" element={<Navigate to="/settings/assistants" replace />} />
          <Route path="*" element={<p className="empty">{t('There\'s nothing here.')}</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function Callback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    completeSignIn(location.search)
      .then((returnTo) => navigate(returnTo, { replace: true }))
      .catch((e) => setError(messageFor(e)))
  }, [navigate])
  if (!error) return <Centered><p className="muted">{t('Signing you in…')}</p></Centered>
  return (
    <Centered>
      <h1>{t('Sign-in didn\'t finish')}</h1>
      <p className="error">{error}</p>
      <button className="primary" onClick={() => signIn('/purchases')}>{t('Sign in again')}</button>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="centered">
      <div className="brand"><img src="/app/icon.svg" width="22" height="22" alt="" />Kept</div>
      {children}
    </main>
  )
}

// Signed out: straight to the email page, coming back to the page that was asked for.
function SignInRedirect() {
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    signIn(location.pathname + location.search).catch((e) => setError(messageFor(e)))
  }, [location])
  if (!error) return <Centered><p className="muted">{t('Taking you to sign-in…')}</p></Centered>
  return <Centered><p className="error">{error}</p><button onClick={() => window.location.reload()}>{t('Try again')}</button></Centered>
}

function Shell() {
  const [signedIn, setSignedIn] = useState(hasSession)
  useEffect(() => {
    const onSignedOut = () => setSignedIn(false)
    window.addEventListener(SIGNED_OUT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT, onSignedOut)
  }, [])
  if (!signedIn) return <SignInRedirect />
  return <SignedIn onSignOut={() => signOut().finally(() => setSignedIn(false))} />
}

function SignedIn({ onSignOut }: { onSignOut: () => void }) {
  const base = useLoad(() => Promise.all([api.setup(), api.categories(), api.costCenters()]), [])
  const [unseenVersion, setUnseenVersion] = useState(0)
  const questions = useLoad(() => api.questions(), [unseenVersion])
  const refreshUnseen = useCallback(() => setUnseenVersion((v) => v + 1), [])

  // The member's saved language wins over the browser's; switching reloads once with it.
  const saved = base.data?.[0].you.language
  useEffect(() => {
    if (saved && saved !== language()) {
      setLanguage(saved)
      location.reload()
    }
  }, [saved])

  if (base.error) return <Centered><p className="error">{base.error}</p><button onClick={base.reload}>{t('Try again')}</button></Centered>
  // A reload keeps the last data on screen, so editing the vocabulary doesn't flash the whole app.
  if (!base.data) return <Centered><p className="muted">{t('Loading…')}</p></Centered>
  const [setup, categories, costCenters] = base.data
  const session: Session = { setup, categories, costCenters, unseen: questions.data?.length ?? 0, needsAssistant: questions.data?.some((q) => q.kind === 'connect') ?? false, refreshUnseen, refreshVocabulary: base.reload }
  return (
    <SessionContext.Provider value={session}>
      <Header onSignOut={onSignOut} />
      <main className="page">
        <Outlet />
      </main>
    </SessionContext.Provider>
  )
}
