'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { HelpTip } from './help-tip'

type Answer = { sample?: boolean; message?: string; id?: string; existing?: boolean; field?: string }
type Field = 'company' | 'name' | 'email' | 'role' | 'phone'

const post = (body: unknown) =>
  fetch('/api/admin/client/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as Answer }))
    .catch(() => ({ ok: false, status: 0, data: {} as Answer }))

/**
 * A new client: the organisation and one contact who can sign in to the portal. Nothing is emailed.
 * "Gets portal emails" starts off, so nobody is sent "new version" emails until you turn it on.
 */
export function NewClientForm({ canEdit, cancelHref }: { canEdit: boolean; cancelHref: string }) {
  const router = useRouter()
  const [f, setF] = useState({ company: '', name: '', email: '', role: '', phone: '', getsEmails: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean; field?: Field } | null>(null)
  const msgRef = useRef<HTMLParagraphElement>(null)
  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  // An error is announced and focused, so it's never missed below the fold.
  useEffect(() => { if (msg?.bad) msgRef.current?.focus() }, [msg])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const r = await post(f)
    if (r.ok && r.data.id) return router.push(`/admin/clients/${encodeURIComponent(r.data.id)}?${r.data.existing ? 'found' : 'added'}=1`)
    setBusy(false)
    setMsg(r.ok
      ? { text: 'Sample data: nothing was saved. With real data this opens the new client’s page.' }
      : { text: r.data.message || (r.status === 0 ? 'Couldn’t reach the site. Check your connection and try again.' : 'That didn’t save. Reload the page and try again.'), bad: true, field: r.data.field as Field | undefined })
  }

  const err = (k: Field) => (msg?.bad && msg.field === k ? { 'aria-invalid': true as const, 'aria-describedby': 'nc-msg' } : {})

  return (
    <form onSubmit={submit} className="p-card ld-form">
      <div className="ld-form-grid">
        <div className="field ld-form-wide">
          <label htmlFor="nc-company">Organisation</label>
          <input id="nc-company" name="company" className="input" required maxLength={160} autoComplete="organization" value={f.company} onChange={set('company')} {...err('company')} />
        </div>
        <div className="field">
          <label htmlFor="nc-name">Contact name</label>
          <input id="nc-name" name="name" className="input" required maxLength={120} autoComplete="name" value={f.name} onChange={set('name')} {...err('name')} />
        </div>
        <div className="field">
          <label htmlFor="nc-email">Contact email</label>
          <input id="nc-email" name="email" className="input" type="email" required maxLength={200} autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} aria-describedby={msg?.field === 'email' ? 'nc-msg nc-email-hint' : 'nc-email-hint'} aria-invalid={msg?.bad && msg.field === 'email' ? true : undefined} />
          <span id="nc-email-hint" className="hint">They sign in to the portal with this address.</span>
        </div>
        <div className="field">
          <label htmlFor="nc-role">Role <span className="muted">(optional)</span></label>
          <input id="nc-role" name="role" className="input" maxLength={80} autoComplete="organization-title" value={f.role} onChange={set('role')} />
        </div>
        <div className="field">
          <label htmlFor="nc-phone">Phone <span className="muted">(optional)</span></label>
          <input id="nc-phone" name="phone" className="input" type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={set('phone')} />
        </div>
        <label className="a-check ld-form-wide">
          <input id="nc-emails" name="getsEmails" type="checkbox" checked={f.getsEmails} onChange={(e) => setF((s) => ({ ...s, getsEmails: e.target.checked }))} />
          <span>Gets portal emails <span className="muted">(“a new version is ready”)</span></span>
        </label>
      </div>

      {msg && (
        <p id="nc-msg" ref={msgRef} tabIndex={-1} className={msg.bad ? 'err m0' : 'm0'} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>
      )}
      <div className="btn-row sc-form-foot">
        <button type="submit" className="btn sa-copper" disabled={busy || !canEdit} aria-busy={busy || undefined}>{busy ? 'Adding…' : 'Add client'}</button>
        <a className="btn btn-secondary" href={cancelHref}>Cancel</a>
        <HelpTip label="About adding a client">Nobody is sent anything. If the organisation or the email is already here, you’re taken to that client instead of making it twice.</HelpTip>
      </div>
      {!canEdit && <p className="muted m0">This sign-in is view only, so it can’t add clients.</p>}
    </form>
  )
}
