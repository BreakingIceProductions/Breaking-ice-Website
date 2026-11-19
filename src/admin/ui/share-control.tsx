'use client'

import { useEffect, useState } from 'react'
import type { Deliverable } from '@/portal/types'

type Share = NonNullable<Deliverable['share']>

/** The version's guest link: make it, copy it, switch it off and on, or replace it. */
export function ShareControl({ projectId, deliverableKey, share: initial, viewOnly }: { projectId: string; deliverableKey: string; share?: Share; viewOnly: boolean }) {
  const [share, setShare] = useState<Share | undefined>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const url = share ? `${origin}/review/${share.token}` : ''

  async function act(action: 'create' | 'on' | 'off' | 'renew') {
    if (action === 'renew' && !window.confirm('Make a new link? The current one stops working straight away, for everyone who has it.')) return
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/admin/review-share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, key: deliverableKey, action }) }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { share?: Share; sample?: boolean } | null
    setBusy(false)
    if (!r?.ok || !j?.share) return setMsg(r?.status === 401 ? 'This sign-in can’t change things, or it has expired.' : 'That didn’t save. Try again.')
    setShare(j.share)
    setMsg(
      (action === 'off' ? 'Switched off. The link now says it isn’t active.' : action === 'on' ? 'Switched on again.' : action === 'renew' ? 'New link made. The old one no longer works.' : 'Link made.') +
        (j.sample ? ' (Sample: not saved.)' : ''),
    )
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setMsg('Copied.')
    } catch {
      setMsg('Select the link and copy it.')
    }
  }

  return (
    <section className="p-card" aria-labelledby="h-share">
      <div className="a-card-head">
        <h2 id="h-share" className="a-h2">Share link</h2>
        <span className={`a-conn-state ${share?.on ? 'on' : 'off'}`}>{share ? (share.on ? 'On' : 'Off') : 'None yet'}</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        For people who aren’t portal contacts (a board member, a colleague). Anyone with the link can watch this version and comment after typing their name. Only the client’s signed-in contacts can approve or ask for changes.
      </p>
      {share ? (
        <>
          <label className="small muted" htmlFor="share-url">Link</label>
          <input id="share-url" className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-describedby="share-state" disabled={!share.on} />
          <p id="share-state" className="small muted" style={{ margin: 0 }}>
            {share.on ? 'Working.' : 'Switched off: it shows “This link isn’t active”.'} Made {new Date(share.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={copy} disabled={!share.on}>Copy link</button>
            {!viewOnly && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(share.on ? 'off' : 'on')}>{share.on ? 'Switch off' : 'Switch on'}</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act('renew')}>Make a new link</button>
              </>
            )}
          </div>
        </>
      ) : (
        !viewOnly && <div><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => act('create')}>Make a share link</button></div>
      )}
      {msg && <p className="small muted" role="status" style={{ margin: 0 }}>{msg}</p>}
    </section>
  )
}
