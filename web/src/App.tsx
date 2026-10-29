import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import { api } from './api.js'
import { completeSignIn, hasSession, signIn, signOut } from './auth.js'
import { PurchasePage } from './pages/Purchase.js'
import { PurchasesPage } from './pages/Purchases.js'
import { UpdatesPage } from './pages/Updates.js'
import { messageFor, SessionContext, SIGNED_OUT, useLoad, type Session } from './session.js'

export function App() {
  return (
    <BrowserRouter basename="/app">
      <Routes>
        <Route path="callback" element={<Callback />} />
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/purchases" replace />} />
          <Route path="purchases" element={<PurchasesPage />} />
          <Route path="purchases/:id" element={<PurchasePage />} />
          <Route path="updates" element={<UpdatesPage />} />
          <Route path="*" element={<p className="empty">There's nothing here.</p>} />
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
  if (!error) return <Centered><p className="muted">Signing you in…</p></Centered>
  return (
    <Centered>
      <h1>Sign-in didn't finish</h1>
      <p className="error">{error}</p>
      <button className="primary" onClick={() => signIn('/purchases')}>Sign in again</button>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="centered">
      <div className="brand">Kept</div>
      {children}
    </main>
  )
}

function SignInScreen() {
  const location = useLocation()
  return (
    <Centered>
      <h1>Your purchases, as your assistant logged them</h1>
      <p className="muted">Review and fix what was logged. Sign in with the email you use with Kept; we'll send you a code.</p>
      <button className="primary" onClick={() => signIn(location.pathname + location.search)}>Sign in</button>
    </Centered>
  )
}

function Shell() {
  const [signedIn, setSignedIn] = useState(hasSession)
  useEffect(() => {
    const onSignedOut = () => setSignedIn(false)
    window.addEventListener(SIGNED_OUT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT, onSignedOut)
  }, [])
  if (!signedIn) return <SignInScreen />
  return <SignedIn onSignOut={() => signOut().finally(() => setSignedIn(false))} />
}

function SignedIn({ onSignOut }: { onSignOut: () => void }) {
  const base = useLoad(() => Promise.all([api.setup(), api.categories(), api.costCenters()]), [])
  const [unseenVersion, setUnseenVersion] = useState(0)
  const updates = useLoad(() => api.updates(), [unseenVersion])
  const refreshUnseen = useCallback(() => setUnseenVersion((v) => v + 1), [])

  if (base.error) return <Centered><p className="error">{base.error}</p><button onClick={base.reload}>Try again</button></Centered>
  if (!base.data) return <Centered><p className="muted">Loading…</p></Centered>
  const [setup, categories, costCenters] = base.data
  const session: Session = { setup, categories, costCenters, unseen: updates.data?.length ?? 0, refreshUnseen }
  return (
    <SessionContext.Provider value={session}>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Kept</span>
          <nav>
            <NavLink to="/purchases">My purchases</NavLink>
            <NavLink to="/updates">
              Updates{session.unseen > 0 && <span className="badge" aria-label={`${session.unseen} new`}>{session.unseen}</span>}
            </NavLink>
          </nav>
          <div className="me">
            <span title={setup.you.email}>{setup.you.name}</span>
            <button className="link" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </SessionContext.Provider>
  )
}
