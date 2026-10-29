import { Link } from 'react-router'
import { api } from '../api.js'
import { formatDate, formatMoney } from '../lib/money.js'
import type { Question, Transaction } from '../lib/types.js'
import { useAction, useLoad, useSession } from '../session.js'
import { categoriesOf } from './Purchases.js'

const SOURCE: Record<string, string> = { talk: 'chat', photo: 'receipt', document: 'receipt', email: 'email', statement: 'statement' }
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Notifications, behind the bell (docs/mockups/notifications.html): Kept's open questions, answered with a button.
// The assistant asks the same ones in chat, one per conversation; answering in either place clears them here.
export function NotificationsPage() {
  const { refreshUnseen } = useSession()
  const list = useLoad(() => api.questions(), [])
  const done = () => { list.reload(); refreshUnseen() }
  return (
    <>
      <div className="page-head"><h1>Notifications</h1></div>
      <p className="muted small">Questions Kept has for you. Your assistant asks the same ones in chat, one at a time; answering in either place clears them here.</p>
      {list.error && <p className="error">{list.error}</p>}
      {list.data && list.data.length === 0 && <p className="empty">Nothing needs you right now.</p>}
      <ul className="updates">
        {list.data?.map((q) => <li key={q.id}><QuestionCard q={q} onAnswered={done} /></li>)}
      </ul>
    </>
  )
}

function QuestionCard({ q, onAnswered }: { q: Question; onAnswered: () => void }) {
  const { setup } = useSession()
  const { busy, error, act } = useAction()
  const currency = setup.household.currency
  const answer = (value: string) => act(async () => { await api.answer(q.id, value); onAnswered() })
  const button = (value: string, label: string, kind = '') => <button className={kind} disabled={busy} onClick={() => answer(value)}>{label}</button>
  return (
    <div className="update">
      {q.kind === 'duplicate' && (
        <>
          <p><strong>Are these the same purchase?</strong> <span className="muted small">{when(q.created_at)}</span></p>
          <div className="pair"><Card t={q.first} label="Logged first" /><Card t={q.later} label="Logged later" /></div>
          <div className="row">{button('merge', 'Yes, merge', 'primary')}{button('different', 'No')}</div>
        </>
      )}
      {q.kind === 'cap' && (
        <>
          <p><strong>Cap passed.</strong> {q.cap.name} is at {formatMoney(q.cap.spent, currency)} of your {formatMoney(q.cap.amount, currency)} cap {q.cap.period === 'month' ? 'this month' : 'this year'}, {Math.round((q.cap.spent / q.cap.amount - 1) * 100)}% over.</p>
          <div className="row"><Link className="button" to="/preferences#caps">Change the cap</Link>{button('remove', 'Remove the cap')}{button('keep', 'Keep it')}</div>
        </>
      )}
      {q.kind === 'missing_charge' && (
        <>
          <p><strong>Missing charge?</strong> {q.text} <span className="muted small">{when(q.created_at)}</span></p>
          <div className="row">{button('stop', 'Cancelled: stop it')}{button('still_paying', 'Still paying')}</div>
        </>
      )}
      {q.kind === 'unused_key' && (
        <>
          <p><strong>Unused key.</strong> "{q.key.name}" {q.key.last_used_at ? `hasn't been used since ${new Date(q.key.last_used_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : 'has never been used'}.</p>
          <div className="row">{button('revoke', 'Revoke it', 'danger')}{button('keep', 'Keep it')}</div>
        </>
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
      <span className="muted small">{formatDate(t.date)} · {categoriesOf(t).join(', ')} · {[...new Set(t.sources.map((s) => SOURCE[s.kind] ?? s.kind))].join(', ')}</span>
    </Link>
  )
}
