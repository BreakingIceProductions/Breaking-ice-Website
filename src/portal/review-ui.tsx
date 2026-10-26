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
