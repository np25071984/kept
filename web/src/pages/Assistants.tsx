import { locale } from '../i18n.js'
import { useState, type FormEvent } from 'react'
import { api } from '../api.js'
import type { ApiKey, Connection } from '../lib/types.js'
import { useAction, useLoad } from '../session.js'
import { t } from '../i18n.js'

// Settings → Assistants & keys: connecting an assistant over MCP, its connections and API keys (VISION.md §4.C).
export function AssistantsPage() {
  return (
    <>
      <ConnectAssistant />
      <Connections />
      <ApiKeys />
    </>
  )
}

function Copyable({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  return (
    <div className="copyable">
      <code aria-label={label}>{value}</code>
      <button type="button" onClick={copy}>{t(copied ? 'Copied' : 'Copy')}</button>
    </div>
  )
}

function ConnectAssistant() {
  const mcpUrl = `${location.origin}/mcp`
  return (
    <section className="section">
      <h2>{t('Connect an assistant')}</h2>
      <p>{t('Add Kept as a custom connector or app in your assistant\'s settings on the web, with this address, then sign in with your email:')}</p>
      <Copyable value={mcpUrl} label="Kept's MCP address" />
      <p className="muted small">{t('Claude and ChatGPT need only the address. Gemini also asks for a client ID and secret: create them below.')}</p>
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
  if (!open) return <button onClick={() => setOpen(true)}>{t('Set up Gemini')}</button>
  if (created) {
    return (
      <div className="panel">
        <p>{t('Enter these in Gemini\'s "Connect to an MCP server" dialog, under Additional settings. The secret is shown only now.')}</p>
        <label>{t('Client ID')}<Copyable value={created.client_id} label={t('Client ID')} /></label>
        <label>{t('Client secret')}<Copyable value={created.client_secret} label={t('Client secret')} /></label>
        <button onClick={() => { setOpen(false); setCreated(null); setRedirect('') }}>{t('Done')}</button>
      </div>
    )
  }
  return (
    <form className="panel editor" onSubmit={submit}>
      <ol className="steps">
        <li>{t('In Gemini on the web, open the connected apps settings, click "+ Custom", and enter the address above.')}</li>
        <li>{t('Open Additional settings and click "Copy redirect URI".')}</li>
        <li>{t('Paste it here.')}</li>
      </ol>
      <label>{t('Redirect URI')}<input value={redirect} onChange={(e) => setRedirect(e.target.value)} placeholder="https://oauth-redirect.googleusercontent.com/r/…" required /></label>
      {error && <p className="error">{error}</p>}
      <div className="row tight">
        <button type="submit" className="primary" disabled={busy || !redirect.trim()}>{t('Create client ID and secret')}</button>
        <button type="button" onClick={() => setOpen(false)}>{t('Cancel')}</button>
      </div>
    </form>
  )
}

const ago = (iso: string) => new Date(iso).toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' })

function Connections() {
  const list = useLoad(() => api.connections(), [])
  return (
    <section className="section">
      <h2>{t('Connected')}</h2>
      <p className="muted small">{t('Assistants and browsers signed in as you. Disconnecting one stops it at once; it has to sign in again.')}</p>
      {list.error && <p className="error">{list.error}</p>}
      {list.data && list.data.length === 0 && <p className="muted">{t('Nothing connected yet.')}</p>}
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
        <div><strong>{connection.web ? t('Kept on the web') : connection.name}</strong></div>
        <div className="muted small">{t('Connected {date} · last used {used}', { date: ago(connection.connected_at), used: ago(connection.last_used_at) })}</div>
        {error && <p className="error">{error}</p>}
      </div>
      {confirming ? (
        <div className="row tight">
          <span className="muted small">{connection.web ? t('Signs out every browser, this one too.') : t('{name} will need to sign in again.', { name: connection.name })}</span>
          <button className="danger" disabled={busy} onClick={() => act(async () => { await api.disconnect(connection.client_id); onChanged() })}>{t('Disconnect')}</button>
          <button onClick={() => setConfirming(false)}>{t('Keep')}</button>
        </div>
      ) : (
        <button className="link" onClick={() => setConfirming(true)}>{t('Disconnect')}</button>
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
      <h2>{t('API keys')}</h2>
      <p className="muted small">{t('For scripts and assistants that take a header instead of signing in: send')} <code>Authorization: Bearer kept_…</code>{t('. A key acts as you.')}</p>
      {created && (
        <div className="panel">
          <p>The key for "{created.name}". Copy it now; it isn't shown again.</p>
          <Copyable value={created.key} label={t('New API key')} />
          <button onClick={() => setCreated(null)}>{t('Done')}</button>
        </div>
      )}
      {keys.error && <p className="error">{keys.error}</p>}
      <ul className="list">
        {(keys.data ?? []).map((key) => <ApiKeyRow key={key.id} apiKey={key} onRevoked={keys.reload} />)}
      </ul>
      <form className="row" onSubmit={create}>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("What it's for, e.g. Laptop script")} aria-label={t('New key name')} />
        <button type="submit" disabled={busy || !name.trim()}>{t('Create key')}</button>
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
        <div className="muted small">{t('Created {date}', { date: ago(apiKey.created_at) })} · {apiKey.last_used_at ? t('last used {date}', { date: ago(apiKey.last_used_at) }) : t('never used')}</div>
        {error && <p className="error">{error}</p>}
      </div>
      {confirming ? (
        <div className="row tight">
          <button className="danger" disabled={busy} onClick={() => act(async () => { await api.revokeApiKey(apiKey.id); onRevoked() })}>{t('Revoke')}</button>
          <button onClick={() => setConfirming(false)}>{t('Keep')}</button>
        </div>
      ) : (
        <button className="link" onClick={() => setConfirming(true)}>{t('Revoke')}</button>
      )}
    </li>
  )
}
