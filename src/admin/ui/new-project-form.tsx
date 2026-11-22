'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { PROJECT_TYPES } from '@/sanity/portal/office-constants'

type ClientOption = { _id: string; organizationName: string }
type Answer = { sample?: boolean; message?: string; id?: string }

const post = (body: unknown) =>
  fetch('/api/admin/project/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as Answer }))
    .catch(() => ({ ok: false, status: 0, data: {} as Answer }))

/**
 * A job that's already agreed: title, client (one you have or a new one), type and an optional
 * start date. It lands in Onboarding and opens its project page. Nothing is emailed.
 */
export function NewProjectForm({ clients, initialClient, canEdit }: { clients: ClientOption[]; initialClient?: string; canEdit: boolean }) {
  const router = useRouter()
  const known = clients.some((c) => c._id === initialClient)
  const [mode, setMode] = useState<'existing' | 'new'>(clients.length ? 'existing' : 'new')
  const [f, setF] = useState({ title: '', clientId: known ? initialClient! : '', company: '', name: '', email: '', projectType: '', startDate: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const msgRef = useRef<HTMLParagraphElement>(null)
  // An error is announced and focused, so it's never missed below the fold.
  useEffect(() => { if (msg?.bad) msgRef.current?.focus() }, [msg])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const body = mode === 'existing'
      ? { title: f.title, clientId: f.clientId, projectType: f.projectType, startDate: f.startDate }
      : { title: f.title, company: f.company, name: f.name, email: f.email, projectType: f.projectType, startDate: f.startDate }
    const r = await post(body)
    if (r.ok && r.data.id) return router.push(`/admin/projects/${encodeURIComponent(r.data.id)}`)
    setBusy(false)
    setMsg(r.ok
      ? { text: 'Sample data: nothing was saved. With real data this opens the new project.' }
      : { text: r.data.message || (r.status === 401 ? 'This sign-in can’t add projects, or it has expired.' : 'That didn’t save. Reload the page and try again.'), bad: true })
  }

  return (
    <form onSubmit={submit} className="p-card ld-form">
      <div className="ld-form-grid">
        <div className="field ld-form-wide">
          <label htmlFor="np-title">Project title</label>
          <input id="np-title" className="input" required maxLength={160} autoComplete="off" value={f.title} onChange={set('title')} />
        </div>

        <fieldset className="np-who ld-form-wide">
          <legend>Client</legend>
          {clients.length > 0 && (
            <div className="np-switch" role="radiogroup" aria-label="Client">
              <label className={mode === 'existing' ? 'on' : ''}><input type="radio" name="np-mode" value="existing" checked={mode === 'existing'} onChange={() => setMode('existing')} /> One we have</label>
              <label className={mode === 'new' ? 'on' : ''}><input type="radio" name="np-mode" value="new" checked={mode === 'new'} onChange={() => setMode('new')} /> A new client</label>
            </div>
          )}
          {mode === 'existing' ? (
            <div className="field">
              <label htmlFor="np-client">Organisation</label>
              <select id="np-client" className="input" required value={f.clientId} onChange={set('clientId')}>
                <option value="" disabled>Choose a client</option>
                {clients.map((c) => <option key={c._id} value={c._id}>{c.organizationName}</option>)}
              </select>
            </div>
          ) : (
            <div className="ld-form-grid">
              <div className="field ld-form-wide"><label htmlFor="np-company">Organisation</label><input id="np-company" className="input" required maxLength={160} autoComplete="off" value={f.company} onChange={set('company')} /></div>
              <div className="field"><label htmlFor="np-name">Contact name</label><input id="np-name" className="input" required maxLength={120} autoComplete="off" value={f.name} onChange={set('name')} /></div>
              <div className="field"><label htmlFor="np-email">Contact email <span className="muted">(optional)</span></label><input id="np-email" className="input" type="email" maxLength={200} autoComplete="off" value={f.email} onChange={set('email')} /></div>
            </div>
          )}
        </fieldset>

        <div className="field"><label htmlFor="np-type">Type</label>
          <select id="np-type" className="input" value={f.projectType} onChange={set('projectType')}><option value="">Not set</option>{PROJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.title}</option>)}</select>
        </div>
        <div className="field"><label htmlFor="np-start">Start date <span className="muted">(optional)</span></label><input id="np-start" className="input" type="date" value={f.startDate} onChange={set('startDate')} /></div>
      </div>

      <p className="muted small m0">It starts in Onboarding. Nobody is sent anything and no onboarding tasks or invoices are made. A new organisation that’s already here is matched by its name or the email instead of being made twice.</p>
      {msg && <p ref={msgRef} tabIndex={-1} className={msg.bad ? 'err m0' : 'm0'} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={busy || !canEdit} aria-busy={busy || undefined}>{busy ? 'Adding…' : 'Add project'}</button>
        <a className="btn btn-secondary" href="/admin/projects">Cancel</a>
      </div>
      {!canEdit && <p className="muted small m0">This sign-in is view only, so it can’t add projects.</p>}
    </form>
  )
}
