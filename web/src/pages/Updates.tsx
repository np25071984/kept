import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError, api } from '../api.js'
import { formatDate, formatMoney } from '../lib/money.js'
import type { Transaction, Update } from '../lib/types.js'
import { useAction, useLoad, useSession } from '../session.js'
import { categoriesOf } from './Purchases.js'

// What the ledger did on its own, and possible duplicates to resolve (VISION.md §4.C, "Updates").
export function UpdatesPage() {
  const { refreshUnseen } = useSession()
  const [showSeen, setShowSeen] = useState(false)
  const list = useLoad(() => api.updates(showSeen), [showSeen])
  const resolved = () => {
    list.reload()
    refreshUnseen()
  }
  const updates = [...(list.data ?? [])].reverse()
  return (
    <>
      <div className="page-head">
        <h1>Updates</h1>
        <label className="check"><input type="checkbox" checked={showSeen} onChange={(e) => setShowSeen(e.target.checked)} /> Show earlier ones</label>
      </div>
      {list.error && <p className="error">{list.error}</p>}
      {list.data && updates.length === 0 && <p className="empty">You're all caught up.</p>}
      <ul className="updates">
        {updates.map((update) => (
          <li key={update.id} className={update.seen_at ? 'seen' : ''}>
            {update.kind === 'possible_duplicate' ? <Duplicate update={update} onResolved={resolved} /> : <Registered update={update} onResolved={resolved} />}
          </li>
        ))}
      </ul>
    </>
  )
}

function When({ update }: { update: Update }) {
  return <span className="muted small">{new Date(update.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
}

function Registered({ update, onResolved }: { update: Update; onResolved: () => void }) {
  const { busy, error, act } = useAction()
  return (
    <div className="update">
      <p>{update.text} <When update={update} /></p>
      <div className="row">
        {update.transaction_id && <Link to={`/purchases/${update.transaction_id}`}>Open the purchase</Link>}
        {!update.seen_at && <button onClick={() => act(async () => { await api.markSeen([update.id]); onResolved() })} disabled={busy}>Got it</button>}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// Loads a purchase that may have been deleted or merged since.
async function maybe(id: string | null): Promise<Transaction | null> {
  if (!id) return null
  try {
    return await api.transaction(id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

function Duplicate({ update, onResolved }: { update: Update; onResolved: () => void }) {
  const pair = useLoad(() => Promise.all([maybe(update.other_transaction_id), maybe(update.transaction_id)]), [update.id])
  const { busy, error, act } = useAction()
  const [earlier, newer] = pair.data ?? [null, null]
  const dismiss = () => act(async () => { await api.markSeen([update.id]); onResolved() })
  // The purchase logged first keeps its id; the newer one's sources join it.
  const merge = () => act(async () => { await api.merge(earlier!.id, newer!.id); await api.markSeen([update.id]); onResolved() })
  return (
    <div className="update">
      <p><strong>Possible duplicate.</strong> {update.text} <When update={update} /></p>
      {pair.error && <p className="error">{pair.error}</p>}
      {pair.data && (
        earlier && newer ? (
          <>
            <div className="pair">
              <Card t={earlier} label="Logged first" />
              <Card t={newer} label="Logged later" />
            </div>
            {!update.seen_at && (
              <div className="row">
                <button className="primary" onClick={merge} disabled={busy}>Same purchase: merge</button>
                <button onClick={dismiss} disabled={busy}>Different purchases</button>
              </div>
            )}
          </>
        ) : (
          <div className="row">
            <span className="muted">One of them has since been merged or deleted.</span>
            {!update.seen_at && <button onClick={dismiss} disabled={busy}>Dismiss</button>}
          </div>
        )
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function Card({ t, label }: { t: Transaction; label: string }) {
  const { setup } = useSession()
  return (
    <Link to={`/purchases/${t.id}`} className="card">
      <span className="muted small">{label}</span>
      <strong>{formatMoney(t.amount, setup.household.currency)}</strong>
      <span>{t.merchant ?? 'No merchant'}</span>
      <span className="muted">{formatDate(t.date)} · {categoriesOf(t).join(', ')}</span>
      <span className="muted small">{t.sources.map((s) => s.kind).join(', ')}</span>
    </Link>
  )
}
