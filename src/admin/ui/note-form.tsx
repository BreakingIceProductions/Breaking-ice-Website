'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function NoteForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/admin/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, text }) }).catch(() => null)
    setBusy(false)
    if (r?.ok) {
      setText('')
      setMsg('Saved.')
      router.refresh()
    } else setMsg('Couldn’t save the note. Try again.')
  }

  return (
    <form onSubmit={save} className="stack" style={{ gap: 'var(--space-2)' }}>
      <label htmlFor="note" className="small muted">Private note (only you see this)</label>
      <textarea id="note" className="input a-note-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" />
      <div className="row-wrap">
        <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save note'}</button>
        <span className="small muted" role="status">{msg}</span>
      </div>
    </form>
  )
}
