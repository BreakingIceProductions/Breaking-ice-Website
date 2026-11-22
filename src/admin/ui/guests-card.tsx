'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useNotify, useUndoable } from './confirm'

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
  const [hidden, setHidden] = useState<string[]>([])
  const notify = useNotify()
  const later = useUndoable()

  // Removing hides the guest at once and offers Undo; they're signed out once the Undo has passed.
  function remove(g: GuestRow) {
    const key = g.key ?? g.email
    setHidden((h) => [...h, key])
    later(`guest-${key}`, {
      text: `Removed ${g.name || g.email}. They’re signed out in a few seconds.`,
      restore: () => setHidden((h) => h.filter((x) => x !== key)),
      commit: () =>
        void fetch('/api/admin/guests', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', key: g.key }) })
          .then((r) => (r.ok ? router.refresh() : Promise.reject(new Error(String(r.status)))))
          .catch(() => {
            setHidden((h) => h.filter((x) => x !== key))
            notify({ text: `${g.name || g.email} wasn’t removed. Check your connection and try again.`, tone: 'error', retry: () => remove(g) })
          }),
    })
  }

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

  const shown = guests.filter((g) => !hidden.includes(g.key ?? g.email))

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
      <p className="small m0">Guests sign in with their own email, see every page, and can’t change anything. Removing someone signs them out within seconds (you can undo it first), and access ends by itself on the date shown.</p>

      <ul className="a-doc-list">
        {shown.map((g) => (
          <li key={g.key ?? g.email}>
            <span className="stack min0">
              <strong>{g.name || g.email}</strong>
              {g.name && <span className="small muted">{g.email}</span>}
            </span>
            <span className="row-wrap small">
              <span className={g.ended ? 'a-urgent' : 'muted'}>{g.when}</span>
              {g.fixed ? <span className="muted">Set in Vercel</span> : canEdit && <button type="button" className="linklike" disabled={busy} onClick={() => remove(g)}>Remove<span className="sr-only"> {g.name || g.email}</span></button>}
            </span>
          </li>
        ))}
        {!shown.length && <li className="muted small">No guests right now.</li>}
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
      <p className="small muted m0 status-line" role="status">{msg}</p>
    </section>
  )
}
