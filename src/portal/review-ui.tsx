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

/** Approve, or ask for changes with a note. Josh is told either way. */
export function FeedbackButtons({ project, deliverable, title }: { project: string; deliverable: string; title: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function send(action: 'approve' | 'changes') {
    if (action === 'changes' && !note.trim()) return setMsg('Add a short note so we know what to change.')
    if (action === 'approve' && !confirm(`Approve ${title}? We’ll take it from here.`)) return
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/portal/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, key: deliverable, action, note }),
    }).catch(() => null)
    setBusy(false)
    if (r?.ok) {
      setMsg(action === 'approve' ? 'Approved. Thank you!' : 'Sent. We’ll get started on the changes.')
      setOpen(false)
      router.refresh()
    } else setMsg('That didn’t go through. Try again, or reply to our email.')
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <div className="btn-row">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => send('approve')}>Approve</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} aria-expanded={open} onClick={() => setOpen((o) => !o)}>Request changes</button>
      </div>
      {open && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <label htmlFor={`fb-${deliverable}`} className="small muted">What would you like changed?</label>
          <textarea id={`fb-${deliverable}`} className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
          <div><button type="button" className="btn btn-primary btn-sm" disabled={busy || !note.trim()} onClick={() => send('changes')}>{busy ? 'Sending…' : 'Send to Breaking Ice'}</button></div>
        </div>
      )}
      {msg && <p className="small muted" role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  )
}
