'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorText, galleryAction } from './admin-api'

/** A button that copies some text and says so. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState('')
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone('Copied')
        } catch {
          setDone('Couldn’t copy')
        }
        setTimeout(() => setDone(''), 2000)
      }}
    >
      <span aria-live="polite">{done || label}</span>
    </button>
  )
}

/** Deleting a gallery: every photo's files and every record. Typing the title confirms it. */
export function DangerZone({ id, title }: { id: string; title: string }) {
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const match = typed.trim() === title.trim()

  return (
    <section className="p-card ga-danger" aria-labelledby="ga-danger-h">
      <h2 id="ga-danger-h" className="a-h2">Delete this gallery</h2>
      <p className="muted small" style={{ margin: 0 }}>Deletes every photo file, the favourites and the activity. The link and the portal stop showing it. This can’t be undone.</p>
      <form
        className="ga-copy-row"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!match) return
          setBusy(true)
          const r = await galleryAction(id, { action: 'delete-gallery', confirm: typed })
          if (!r.ok) {
            setBusy(false)
            return setMsg(errorText(r))
          }
          router.push('/admin/galleries')
          router.refresh()
        }}
      >
        <label className="sr-only" htmlFor="ga-del">Type the gallery title to confirm</label>
        <input id="ga-del" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type “${title}” to confirm`} autoComplete="off" disabled={busy} />
        <button type="submit" className="btn btn-secondary btn-sm ga-danger-btn" disabled={!match || busy}>{busy ? 'Deleting…' : 'Delete gallery'}</button>
      </form>
      {msg && <p className="small a-urgent" role="status" style={{ margin: 0 }}>{msg}</p>}
    </section>
  )
}
