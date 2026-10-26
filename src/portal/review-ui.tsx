'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FileIcon, type FileKind } from './file-icon'

/** Preview of a design or document version; falls back to its file icon when Drive has no preview. */
export function ReviewThumb({ src, kind, ext }: { src: string; kind: FileKind; ext?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="review-thumb-icon"><FileIcon kind={kind} ext={ext} size={56} /></span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
}

/**
 * "Approve for next stage", plus (for documents) a notes box that asks for changes.
 * Video notes are left on Vimeo's review page instead. Josh is told either way.
 */
export function FeedbackButtons({ project, deliverable, title, notes = true }: { project: string; deliverable: string; title: string; notes?: boolean }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function send(action: 'approve' | 'changes') {
    if (action === 'changes' && !note.trim()) return setMsg('Write a short note so we know what to change.')
    if (action === 'approve' && !confirm(`Approve ${title} for the next stage?`)) return
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/portal/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, key: deliverable, action, note }),
    }).catch(() => null)
    setBusy(false)
    if (r?.ok) {
      setMsg(action === 'approve' ? 'Approved. Thank you! We’ll take it to the next stage.' : 'Notes sent. We’ll get started on the changes.')
      setNote('')
      router.refresh()
    } else setMsg('That didn’t go through. Try again, or reply to our email.')
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      {notes && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <label htmlFor={`fb-${deliverable}`} className="small muted">Notes on this version</label>
          <textarea id={`fb-${deliverable}`} className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} placeholder="What would you like changed?" />
          <div><button type="button" className="btn btn-secondary btn-sm" disabled={busy || !note.trim()} onClick={() => send('changes')}>{busy ? 'Sending…' : 'Send notes'}</button></div>
        </div>
      )}
      <div><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => send('approve')}>Approve for next stage</button></div>
      {msg && <p className="small muted" role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  )
}

const longDate = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '')

/** Icon and title, then "Version 1 · October 25, 2026 · 0:30". */
export function VersionHead({ title, kind, ext, version, date, length }: { title: string; kind: FileKind; ext?: string; version: string; date?: string; length?: string }) {
  return (
    <div className="vp-head">
      <FileIcon kind={kind} ext={ext} size={36} />
      <div style={{ minWidth: 0 }}>
        <h4 className="lib-title">{title}</h4>
        <p className="vp-meta">{[version, longDate(date), length].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  )
}

/** The video's thumbnail with a play button: clicking it is "Watch video". */
export function WatchTile({ href, thumb, title }: { href: string; thumb?: string; title: string }) {
  return (
    <a className="watch-tile" href={href} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {thumb && <img src={thumb} alt="" />}
      <span className="watch-play" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
      </span>
      <span className="watch-label">Watch video<span className="sr-only">: {title} (opens in a new tab)</span></span>
    </a>
  )
}
