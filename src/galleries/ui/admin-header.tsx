'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorText, fmtDay, galleryAction } from './admin-api'
import type { ClientOption, ProjectOption } from './admin-new-gallery'

type Props = {
  id: string
  title: string
  date?: string
  clientId?: string
  projectId?: string
  clientName?: string
  projectTitle?: string
  status: 'draft' | 'live'
  shareOn: boolean
  shareUrl: string
  count: number
  size: string
  clients: ClientOption[]
  projects: ProjectOption[]
  ro: boolean
}

/** Top of a gallery: its name and who it's for (editable), Draft ↔ Live, and the ways to look at it as the client does. */
export function GalleryHeader(p: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(p.title)
  const [date, setDate] = useState(p.date ?? '')
  const [clientId, setClientId] = useState(p.clientId ?? '')
  const [projectId, setProjectId] = useState(p.projectId ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const theirProjects = p.projects.filter((x) => x.clientId === clientId)
  const clientLabel = p.clientName ?? p.clients.find((c) => c.id === p.clientId)?.name
  const projectLabel = p.projectTitle ?? p.projects.find((x) => x.id === p.projectId)?.title

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setMsg('The gallery needs a title.')
    setBusy(true)
    const r = await galleryAction(p.id, { action: 'update', title, date, clientId, projectId })
    setBusy(false)
    if (!r.ok) return setMsg(errorText(r))
    setMsg('')
    setEditing(false)
    router.refresh()
  }

  async function toggleStatus() {
    const next = p.status === 'live' ? 'draft' : 'live'
    if (next === 'draft' && !window.confirm('Back to draft? The client and anyone with the link will stop seeing this gallery until you make it live again.')) return
    setBusy(true)
    const r = await galleryAction(p.id, { action: 'update', status: next })
    setBusy(false)
    if (!r.ok) return setMsg(errorText(r))
    setMsg(next === 'live' ? 'Live: the client can see it.' : 'Back to draft: only you can see it.')
    router.refresh()
  }

  const canOpenLink = p.status === 'live' && p.shareOn

  return (
    <header className="ga-head">
      <p className="muted small ga-crumb">
        <Link className="text-link-plain muted" href="/admin/galleries">Galleries</Link> /
      </p>
      <div className="a-head">
        <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
          <span className="a-client">{[clientLabel ?? 'No client', projectLabel].filter(Boolean).join(' · ')}</span>
          <h1 className="a-h1 ga-title">{p.title}</h1>
          <p className="muted small" style={{ margin: 0 }}>{[p.date ? `Shot ${fmtDay(p.date)}` : 'No shoot date', `${p.count} ${p.count === 1 ? 'photo' : 'photos'}`, p.count ? p.size : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="ga-head-side">
          <div className="ga-status" role="group" aria-label="Who can see it">
            <span className={`ga-tag ${p.status === 'live' ? 'ga-tag-on' : ''}`}>{p.status === 'live' ? 'Live' : 'Draft'}</span>
            <span className="muted small">{p.status === 'live' ? 'The client can see it' : 'Only you can see it'}</span>
            {!p.ro && (
              <button type="button" className={`btn btn-sm ${p.status === 'live' ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleStatus} disabled={busy}>
                {p.status === 'live' ? 'Back to draft' : 'Make it live'}
              </button>
            )}
          </div>
          <div className="btn-row ga-head-links">
            <Link className="text-link" href={`/admin/galleries/${p.id}/preview`} target="_blank">Preview as client<span className="sr-only"> (opens in a new tab)</span></Link>
            {canOpenLink ? (
              <a className="text-link" href={p.shareUrl} target="_blank" rel="noopener noreferrer">Open share link<span className="sr-only"> (opens in a new tab)</span></a>
            ) : (
              <span className="muted small" title="The share link works once the gallery is live and the link is switched on">Share link not working yet</span>
            )}
            {!p.ro && (
              <button type="button" className="linklike" onClick={() => setEditing((v) => !v)} aria-expanded={editing} aria-controls="ga-details">
                {editing ? 'Close details' : 'Edit details'}
              </button>
            )}
          </div>
        </div>
      </div>
      {editing && (
        <form id="ga-details" className="p-card ga-details" onSubmit={save}>
          <fieldset className="ga-fieldset ga-new-grid" disabled={busy}>
            <div className="field">
              <label htmlFor="ga-d-title">Title</label>
              <input id="ga-d-title" className="input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="ga-d-date">Shoot date</label>
              <input id="ga-d-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ga-d-client">Client</label>
              <select
                id="ga-d-client"
                className="input"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value)
                  setProjectId('')
                }}
              >
                <option value="">No client</option>
                {p.clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ga-d-project">Project <span className="muted small">(optional)</span></label>
              <select id="ga-d-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId || !theirProjects.length}>
                <option value="">{theirProjects.length ? 'None' : 'No projects for this client'}</option>
                {theirProjects.map((x) => (
                  <option key={x.id} value={x.id}>{x.title}</option>
                ))}
              </select>
            </div>
          </fieldset>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Save details</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
      {msg && <p className="small muted" role="status" style={{ margin: 0 }}>{msg}</p>}
    </header>
  )
}
