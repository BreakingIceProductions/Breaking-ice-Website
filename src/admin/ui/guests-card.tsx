'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type GuestRow = { key?: string; email: string; name?: string; /** "Through Nov 26", "Ended Nov 2" or "No end date". */ when: string; ended?: boolean; /** Set in Vercel, so it can't be removed here. */ fixed?: boolean }

const LENGTHS = [
  [1, '1 day'],
  [3, '3 days'],
  [7, '1 week'],
  [14, '2 weeks'],
  [30, '30 days'],
  [90, '90 days'],
] as const

/** Add or remove people who can look around the back office but change nothing. */
export function GuestsCard({ guests, signInUrl, canEdit }: { guests: GuestRow[]; signInUrl: string; canEdit: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [days, setDays] = useState(14)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  async function send(body: Record<string, unknown>) {
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/admin/guests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) return setMsg(j.message || 'That didn’t save. Reload the page and try again.')
    if (body.action === 'add') {
      setEmail('')
      setName('')
      setMsg('Added. Send them the sign-in link; they enter their own email there.')
    }
    router.refresh()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(signInUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMsg(`Copy this link: ${signInUrl}`)
    }
  }

  return (
    <section className="p-card" aria-labelledby="h-guests">
      <div className="a-card-head">
        <h2 id="h-guests" className="a-h2">View-only guests</h2>
        <button type="button" className="linklike small" onClick={copy}>{copied ? 'Copied' : 'Copy sign-in link'}</button>
      </div>
      <p className="small" style={{ margin: 0 }}>Guests sign in with their own email, see every page, and can’t change anything. Removing someone signs them out right away, and access ends by itself on the date shown.</p>

      <ul className="a-doc-list">
        {guests.map((g) => (
          <li key={g.key ?? g.email}>
            <span className="stack" style={{ minWidth: 0 }}>
              <strong>{g.name || g.email}</strong>
              {g.name && <span className="small muted">{g.email}</span>}
            </span>
            <span className="row-wrap small">
              <span className={g.ended ? 'a-urgent' : 'muted'}>{g.when}</span>
              {g.fixed ? <span className="muted">Set in Vercel</span> : canEdit && <button type="button" className="linklike" disabled={busy} onClick={() => send({ action: 'remove', key: g.key })}>Remove<span className="sr-only"> {g.name || g.email}</span></button>}
            </span>
          </li>
        ))}
        {!guests.length && <li className="muted small">No guests right now.</li>}
      </ul>

      {canEdit && (
        <form className="g-form" onSubmit={(e) => { e.preventDefault(); send({ action: 'add', email, name, days }) }}>
          <div className="field g-wide"><label htmlFor="g-email">Email</label><input id="g-email" className="input" type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="g-name">Name (optional)</label><input id="g-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field g-short">
            <label htmlFor="g-days">For</label>
            <select id="g-days" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {LENGTHS.map(([n, label]) => <option key={n} value={n}>{label}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add guest'}</button>
        </form>
      )}
      <p className="small muted" role="status" style={{ margin: 0, minHeight: 20 }}>{msg}</p>
    </section>
  )
}
