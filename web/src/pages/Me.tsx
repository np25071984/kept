import { useState, type FormEvent } from 'react'
import { api } from '../api.js'
import type { ApiKey, Connection } from '../lib/types.js'
import { useAction, useLoad, useSession } from '../session.js'
import { NotesSection, WatchingSection } from './Memory.js'

// The member's own settings: connecting assistants, API keys, watched groups and notes (VISION.md §4.C, "Me").
export function MePage() {
  const { setup } = useSession()
  return (
    <>
      <div className="page-head">
        <h1>{setup.you.name}</h1>
        <p className="muted">{setup.you.email} · {setup.you.role === 'owner' ? 'Owner' : 'Member'}</p>
      </div>
      <ConnectAssistant />
      <Connections />
      <ApiKeys />
      <WatchingSection />
      <NotesSection />
    </>
  )
}

function Copyable({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  return (
    <div className="copyable">
      <code aria-label={label}>{value}</code>
      <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  )
}

function ConnectAssistant() {
  const mcpUrl = `${location.origin}/mcp`
  return (
    <section className="section">
      <h2>Connect an assistant</h2>
      <p>Add Kept as a custom connector or app in your assistant's settings on the web, with this address, then sign in with your email:</p>
      <Copyable value={mcpUrl} label="Kept's MCP address" />
      <p className="muted small">Claude and ChatGPT need only the address. Gemini also asks for a client ID and secret: create them below.</p>
      <GeminiClient />
    </section>
  )
}

// Gemini's redirect URI contains the Google account, so every member creates their own client (IMPLEMENTATION.md §5.4).
function GeminiClient() {
  const [open, setOpen] = useState(false)
  const [redirect, setRedirect] = useState('')
  const [created, setCreated] = useState<{ client_id: string; client_secret: string } | null>(null)
  const { busy, error, act } = useAction()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void act(async () => setCreated(await api.createClient('Gemini', redirect.trim())))
  }
  if (!open) return <button onClick={() => setOpen(true)}>Set up Gemini</button>
  if (created) {
    return (
      <div className="panel">
        <p>Enter these in Gemini's "Connect to an MCP server" dialog, under Additional settings. The secret is shown only now.</p>
        <label>Client ID<Copyable value={created.client_id} label="Client ID" /></label>
        <label>Client secret<Copyable value={created.client_secret} label="Client secret" /></label>
        <button onClick={() => { setOpen(false); setCreated(null); setRedirect('') }}>Done</button>
      </div>
    )
  }
  return (
    <form className="panel editor" onSubmit={submit}>
      <ol className="steps">
        <li>In Gemini on the web, open the connected apps settings, click "+ Custom", and enter the address above.</li>
        <li>Open Additional settings and click "Copy redirect URI".</li>
        <li>Paste it here.</li>
      </ol>
      <label>Redirect URI<input value={redirect} onChange={(e) => setRedirect(e.target.value)} placeholder="https://oauth-redirect.googleusercontent.com/r/…" required /></label>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !redirect.trim()}>Create client ID and secret</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

const ago = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function Connections() {
  const list = useLoad(() => api.connections(), [])
  return (
    <section className="section">
      <h2>Connected</h2>
      <p className="muted small">Assistants and browsers signed in as you. Disconnecting one stops it at once; it has to sign in again.</p>
      {list.error && <p className="error">{list.error}</p>}
      {list.data && list.data.length === 0 && <p className="muted">Nothing connected yet.</p>}
      <ul className="list">
        {(list.data ?? []).map((c) => <ConnectionRow key={c.client_id} connection={c} onChanged={list.reload} />)}
      </ul>
    </section>
  )
}

function ConnectionRow({ connection, onChanged }: { connection: Connection; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const { busy, error, act } = useAction()
  return (
    <li className="list-row">
      <div className="grow">
        <div><strong>{connection.web ? 'Kept on the web' : connection.name}</strong></div>
        <div className="muted small">Connected {ago(connection.connected_at)} · last used {ago(connection.last_used_at)}</div>
        {error && <p className="error">{error}</p>}
      </div>
      {confirming ? (
        <div className="row tight">
          <span className="muted small">{connection.web ? 'Signs out every browser, this one too.' : `${connection.name} will need to sign in again.`}</span>
          <button className="danger" disabled={busy} onClick={() => act(async () => { await api.disconnect(connection.client_id); onChanged() })}>Disconnect</button>
          <button onClick={() => setConfirming(false)}>Keep</button>
        </div>
      ) : (
        <button className="link" onClick={() => setConfirming(true)}>Disconnect</button>
      )}
    </li>
  )
}

function ApiKeys() {
  const keys = useLoad(() => api.apiKeys(), [])
  const [name, setName] = useState('')
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null)
  const { busy, error, act } = useAction()
  const create = (event: FormEvent) => {
    event.preventDefault()
    void act(async () => {
      const key = await api.createApiKey(name.trim())
      setCreated({ name: name.trim(), key: key.key })
      setName('')
      keys.reload()
    })
  }
  return (
    <section className="section">
      <h2>API keys</h2>
      <p className="muted small">For scripts and assistants that take a header instead of signing in: send <code>Authorization: Bearer kept_…</code>. A key acts as you.</p>
      {created && (
        <div className="panel">
          <p>The key for "{created.name}". Copy it now; it isn't shown again.</p>
          <Copyable value={created.key} label="New API key" />
          <button onClick={() => setCreated(null)}>Done</button>
        </div>
      )}
      {keys.error && <p className="error">{keys.error}</p>}
      <ul className="list">
        {(keys.data ?? []).map((key) => <ApiKeyRow key={key.id} apiKey={key} onRevoked={keys.reload} />)}
      </ul>
      <form className="row" onSubmit={create}>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="What it's for, e.g. Laptop script" aria-label="New key name" />
        <button type="submit" disabled={busy || !name.trim()}>Create key</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function ApiKeyRow({ apiKey, onRevoked }: { apiKey: ApiKey; onRevoked: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const { busy, error, act } = useAction()
  return (
    <li className="list-row">
      <div className="grow">
        <div>{apiKey.name}</div>
        <div className="muted small">Created {ago(apiKey.created_at)} · {apiKey.last_used_at ? `last used ${ago(apiKey.last_used_at)}` : 'never used'}</div>
        {error && <p className="error">{error}</p>}
      </div>
      {confirming ? (
        <div className="row tight">
          <button className="danger" disabled={busy} onClick={() => act(async () => { await api.revokeApiKey(apiKey.id); onRevoked() })}>Revoke</button>
          <button onClick={() => setConfirming(false)}>Keep</button>
        </div>
      ) : (
        <button className="link" onClick={() => setConfirming(true)}>Revoke</button>
      )}
    </li>
  )
}
