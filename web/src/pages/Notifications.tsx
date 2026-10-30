import { locale } from '../i18n.js'
import { Link } from 'react-router'
import { api } from '../api.js'
import { formatDate, formatMoney } from '../lib/money.js'
import type { Question, Transaction } from '../lib/types.js'
import { useAction, useLoad, useSession } from '../session.js'
import { categoriesOf } from './Purchases.js'
import { t as tr } from '../i18n.js'

const SOURCE: Record<string, string> = { talk: 'chat', photo: 'receipt', document: 'receipt', email: 'email', statement: 'statement', other: 'other' }
const when = (iso: string) => new Date(iso).toLocaleDateString(locale(), { month: 'short', day: 'numeric' })

// Notifications, behind the bell: Kept's open questions, answered with a button.
// The assistant asks the same ones in chat, one per conversation; answering in either place clears them here.
export function NotificationsPage() {
  const { refreshUnseen } = useSession()
  const list = useLoad(() => api.questions(), [])
  const done = () => { list.reload(); refreshUnseen() }
  return (
    <>
      <div className="page-head"><h1>{tr('Notifications')}</h1></div>
      <p className="muted small">{tr('Questions Kept has for you. Your assistant asks the same ones in chat, one at a time; answering in either place clears them here.')}</p>
      {list.error && <p className="error">{list.error}</p>}
      {list.data && list.data.length === 0 && <p className="empty">{tr('Nothing needs you right now.')}</p>}
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
  const button = (value: string, label: string, kind = '') => <button className={kind} disabled={busy} onClick={() => answer(value)}>{tr(label)}</button>
  return (
    <div className="update">
      {q.kind === 'duplicate' && (
        <>
          <p><strong>{tr('Are these the same purchase?')}</strong> <span className="muted small">{when(q.created_at)}</span></p>
          <div className="pair"><Card t={q.first} label={tr('Logged first')} /><Card t={q.later} label={tr('Logged later')} /></div>
          <div className="row">{button('merge', 'Yes, merge', 'primary')}{button('different', 'No')}</div>
        </>
      )}
      {q.kind === 'cap' && (
        <>
          <p><strong>{tr('Cap passed.')}</strong> {tr(q.cap.period === 'month' ? '{name} is at {spent} of your {amount} cap this month, {pct}% over.' : '{name} is at {spent} of your {amount} cap this year, {pct}% over.', { name: q.cap.name, spent: formatMoney(q.cap.spent, currency), amount: formatMoney(q.cap.amount, currency), pct: Math.round((q.cap.spent / q.cap.amount - 1) * 100) })}</p>
          <div className="row"><Link className="button" to="/preferences#caps">{tr('Change the cap')}</Link>{button('remove', 'Remove the cap')}{button('keep', 'Keep it')}</div>
        </>
      )}
      {q.kind === 'missing_charge' && (
        <>
          <p><strong>{tr('Missing charge?')}</strong> {q.text} <span className="muted small">{when(q.created_at)}</span></p>
          <div className="row">{button('stop', 'Cancelled: stop it')}{button('still_paying', 'Still paying')}</div>
        </>
      )}
      {q.kind === 'connect' && (
        <>
          <p><strong>{tr('Connect your assistant.')}</strong> {tr('Then you log purchases by telling it: a sentence, a receipt photo or a statement.')}</p>
          <div className="row"><Link className="button primary" to="/settings/assistants">{tr('Connect an assistant')}</Link></div>
        </>
      )}
      {q.kind === 'unused_key' && (
        <>
          <p><strong>{tr('Unused key.')}</strong> {q.key.last_used_at ? tr('"{name}" hasn\'t been used since {date}.', { name: q.key.name, date: new Date(q.key.last_used_at).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }) }) : tr('"{name}" has never been used.', { name: q.key.name })}</p>
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
      <span>{t.merchant ?? tr('No merchant')}</span>
      <span className="muted small">{formatDate(t.date)} · {categoriesOf(t).join(', ')} · {[...new Set(t.sources.map((s) => tr(SOURCE[s.kind] ?? s.kind)))].join(', ')}</span>
    </Link>
  )
}
