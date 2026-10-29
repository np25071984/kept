import { useState, type FormEvent } from 'react'
import { api } from '../api.js'
import type { Invite, Member } from '../lib/types.js'
import { useAction, useLoad, useSession } from '../session.js'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Settings → Household → Members (docs/mockups/settings-household.html): owners invite, promote and remove; members see the list.
export function MembersPage() {
  const { setup } = useSession()
  const owner = setup.you.role === 'owner'
  const list = useLoad(() => api.members(), [])
  return (
    <section className="section">
      {list.error && <p className="error">{list.error}</p>}
      <ul className="list">
        {list.data?.members.map((m) => <MemberRow key={m.id} member={m} owner={owner} onChanged={list.reload} />)}
        {list.data?.invites.map((i) => <InviteRow key={i.id} invite={i} owner={owner} onChanged={list.reload} />)}
      </ul>
      {owner && <InviteForm onSent={list.reload} />}
    </section>
  )
}

function MemberRow({ member, owner, onChanged }: { member: Member; owner: boolean; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const { busy, error, act } = useAction()
  return (
    <li className="list-row">
      <div className="grow">
        <div><strong>{member.name}</strong> <span className="muted small">· {member.you ? 'you · ' : ''}{member.role}</span></div>
        <div className="small muted">{member.email} · joined {shortDate(member.joined_at)}</div>
      </div>
      {owner && !member.you && !confirming && (
        <div className="row tight">
          <button className="link" disabled={busy} onClick={() => act(async () => { await api.setRole(member.id, member.role === 'owner' ? 'member' : 'owner'); onChanged() })}>
            {member.role === 'owner' ? 'Make member' : 'Make owner'}
          </button>
          <button className="link" onClick={() => setConfirming(true)}>Remove</button>
        </div>
      )}
      {confirming && (
        <div className="row tight">
          <span className="small muted">Remove {member.name} and everything they logged?</span>
          <button className="danger" disabled={busy} onClick={() => act(async () => { await api.removeMember(member.id); onChanged() })}>Remove</button>
          <button onClick={() => setConfirming(false)}>Keep</button>
        </div>
      )}
      {error && <p className="error full">{error}</p>}
    </li>
  )
}

function InviteRow({ invite, owner, onChanged }: { invite: Invite; owner: boolean; onChanged: () => void }) {
  const { busy, error, act } = useAction()
  return (
    <li className="list-row">
      <div className="grow"><span className="muted">{invite.email}</span> <span className="tag">Invited {shortDate(invite.sent_at)}</span></div>
      {owner && (
        <div className="row tight">
          <button className="link" disabled={busy} onClick={() => act(async () => { await api.invite(invite.email); await api.cancelInvite(invite.id); onChanged() })}>Send again</button>
          <button className="link" disabled={busy} onClick={() => act(async () => { await api.cancelInvite(invite.id); onChanged() })}>Cancel invite</button>
        </div>
      )}
      {error && <p className="error full">{error}</p>}
    </li>
  )
}

function InviteForm({ onSent }: { onSent: () => void }) {
  const [email, setEmail] = useState('')
  const { busy, error, act } = useAction()
  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (await act(() => api.invite(email.trim()))) {
      setEmail('')
      onSent()
    }
  }
  return (
    <form className="row" onSubmit={send}>
      <input className="grow" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Invite by email" aria-label="Invite by email" />
      <button type="submit" disabled={busy || !email.includes('@')}>Invite</button>
      {error && <p className="error full">{error}</p>}
    </form>
  )
}
