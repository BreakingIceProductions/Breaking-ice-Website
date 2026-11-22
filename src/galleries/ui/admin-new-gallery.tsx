'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorText } from './admin-api'

export type ClientOption = { id: string; name: string }
export type ProjectOption = { id: string; title: string; clientId: string }

/** "New gallery": a title, the shoot date and who it's for. Opens the new gallery once it exists. */
export function NewGalleryForm({ clients, projects, disabled }: { clients: ClientOption[]; projects: ProjectOption[]; disabled?: boolean }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const theirProjects = projects.filter((p) => p.clientId === clientId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setMsg('Give the gallery a title.')
    setBusy(true)
    setMsg('')
    try {
      const r = await fetch('/api/admin/galleries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, date, clientId, projectId }) })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string }
      if (!r.ok || !j.id) {
        setBusy(false)
        return setMsg(errorText({ ok: false, status: r.status, error: j.error }))
      }
      router.push(`/admin/galleries/${j.id}`)
    } catch {
      setBusy(false)
      setMsg(errorText({ ok: false, status: 0, error: 'network' }))
    }
  }

  return (
    <form className="p-card ga-new" onSubmit={submit} aria-labelledby="ga-new-h">
      <h2 id="ga-new-h" className="a-h2">New gallery</h2>
      <fieldset className="ga-fieldset ga-new-grid" disabled={disabled || busy}>
        <div className="field">
          <label htmlFor="ga-new-title">Title</label>
          <input id="ga-new-title" className="input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="Spring team portraits" required />
        </div>
        <div className="field">
          <label htmlFor="ga-new-date">Shoot date</label>
          <input id="ga-new-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ga-new-client">Client</label>
          <select
            id="ga-new-client"
            className="input"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value)
              setProjectId('')
            }}
          >
            <option value="">No client yet</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ga-new-project">Project <span className="muted small">(optional)</span></label>
          <select id="ga-new-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId || !theirProjects.length}>
            <option value="">{!clientId ? 'Choose a client first' : theirProjects.length ? 'None' : 'No projects for this client'}</option>
            {theirProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      </fieldset>
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={disabled || busy}>{busy ? 'Making it…' : 'Make the gallery'}</button>
        <span className="muted small">It starts as a draft: the client can’t see it until you switch it to Live.</span>
      </div>
      {msg && <p className="small a-urgent m0" role="status">{msg}</p>}
    </form>
  )
}
