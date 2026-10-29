import { createContext, useCallback, useContext, useEffect, useState, type DependencyList } from 'react'
import { ApiError, SignedOut } from './api.js'
import { t } from './i18n.js'
import type { CostCenter, Setup } from './lib/types.js'

// What every signed-in page needs: who is signed in, the household's vocabulary, and the unseen-updates count.

export interface Session {
  setup: Setup
  categories: string[]
  costCenters: CostCenter[]
  unseen: number
  refreshUnseen: () => void
  refreshVocabulary: () => void
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession outside the signed-in shell')
  return session
}

export const SIGNED_OUT = 'kept:signed-out'

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return t('Something went wrong.')
}

export interface Loaded<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
}

// Runs a request when deps change. Signing out anywhere sends the whole app back to the sign-in screen.
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): Loaded<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)
  useEffect(() => {
    let current = true
    setLoading(true)
    run()
      .then((value) => current && (setData(value), setError(null)))
      .catch((e) => {
        if (e instanceof SignedOut) window.dispatchEvent(new Event(SIGNED_OUT))
        else if (current) setError(messageFor(e))
      })
      .finally(() => current && setLoading(false))
    return () => {
      current = false
    }
  }, [run, version])
  return { data, error, loading, reload: useCallback(() => setVersion((v) => v + 1), []) }
}

// Wraps an action so its error shows where it was taken.
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (e) {
      if (e instanceof SignedOut) window.dispatchEvent(new Event(SIGNED_OUT))
      else setError(messageFor(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, act, clearError: () => setError(null) }
}
