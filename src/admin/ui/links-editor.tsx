'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { downloadSource, linkKind, type ProjectLink } from '@/portal/links'

/** Documents & links for the client: paste a Google Drive or Docs link and it shows (and downloads) in their portal. */
export function LinksEditor({ projectId, links }: { projectId: string; links: ProjectLink[] }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function send(method: 'POST' | 'DELETE', body: Record<string, string>) {
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/admin/link', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...body }) }).catch(() => null)
    setBusy(false)
    return Boolean(r?.ok)
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!/^https:\/\/\S+$/i.test(url.trim())) return setMsg('Paste a full link starting with https://')
    if (await send('POST', { title, url, note })) {
      setTitle('')
      setUrl('')
      setNote('')
      setMsg('Added. It’s in their portal now.')
      router.refresh()
    } else setMsg('Couldn’t add it. Try again.')
  }

  async function remove(l: ProjectLink) {
    if (!confirm(`Remove “${l.title}” from the client’s portal?`)) return
    if (await send('DELETE', { key: l._key })) router.refresh()
    else setMsg('Couldn’t remove it. Try again.')
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {links.length > 0 && (
        <ul className="a-doc-list">
          {links.map((l) => (
            <li key={l._key}>
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <a className="a-strong-link" href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a>
                <span className="muted small">
                  {[linkKind(l.url ?? ''), downloadSource(l.url ?? '') ? 'they download it in the portal' : 'opens in a new tab', l.note].filter(Boolean).join(' · ')}
                </span>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => remove(l)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="stack" style={{ gap: 'var(--space-2)' }}>
        <label htmlFor="doc-title" className="small muted">Title</label>
        <input id="doc-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Poster: water management" required maxLength={140} />
        <label htmlFor="doc-url" className="small muted">Google Drive, Docs or any link</label>
        <input id="doc-url" className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…" required />
        <label htmlFor="doc-note" className="small muted">Note (optional)</label>
        <input id="doc-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Print-ready" maxLength={200} />
        <p className="small muted" style={{ margin: 0 }}>Keep it in the BI Clients shared drive (stays private) or share it as “Anyone with the link”, and it downloads straight from the portal.</p>
        <div className="row-wrap">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !title.trim() || !url.trim()}>{busy ? 'Saving…' : 'Add to their portal'}</button>
          <span className="small muted" role="status">{msg}</span>
        </div>
      </form>
    </div>
  )
}
