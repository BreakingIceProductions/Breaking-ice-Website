'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { DocText } from '@/portal/sign-doc'
import { statusLabel, type Audience, type DocField, type SignStatus } from '@/portal/sign-docs'
import { fmtDate } from '@/admin/dates'
import { StepBar } from './viz-d'

/* ── Shapes the pages hand over (no tokens in lists except the link itself) ── */

export type SendTemplate = { id: string; title: string; audience: Audience; body: string; fields: DocField[]; projectOptional: boolean }
export type SendProject = { id: string; title: string; org: string; hasClient: boolean; contacts: { key: string; name: string; email: string }[] }
export type RequestRow = {
  id: string
  title: string
  signer: string
  email: string
  audience: Audience
  project?: string
  projectHref?: string
  status: SignStatus
  createdAt: string
  emailedAt?: string
  viewedAt?: string
  signedAt?: string
  voidedAt?: string
  link: string
  viewHref: string
  pdfHref?: string
}

const day = (iso?: string) => fmtDate(iso)

const post = (body: unknown) =>
  fetch('/api/admin/sign-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
    .catch(() => ({ ok: false, message: 'No connection. Try again.' }))

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/* ── The list of requests, with their actions ─────────────────────────── */

export function RequestTable({ rows, showProject = true, empty, steps }: { rows: RequestRow[]; showProject?: boolean; empty: string; /** Show Sent › Opened › Signed as a bar instead of the line of dates (the Library). */ steps?: boolean }) {
  const router = useRouter()
  const [msg, setMsg] = useState<{ id: string; text: string; err?: boolean }>()
  const [busy, setBusy] = useState('')
  const [confirmVoid, setConfirmVoid] = useState('')

  async function act(r: RequestRow, action: 'email' | 'void') {
    setBusy(`${action}-${r.id}`)
    const j = await post({ action, id: r.id })
    setBusy('')
    setConfirmVoid('')
    if (!j.ok) return setMsg({ id: r.id, text: j.message ?? 'That didn’t work. Try again.', err: true })
    setMsg({ id: r.id, text: action === 'void' ? 'Withdrawn. The link now says so.' : j.simulated ? `Sample mode: the email to ${r.signer} was simulated, nothing was sent.` : `Emailed to ${r.signer}.` })
    router.refresh()
  }

  if (!rows.length) return <p className="muted small a-empty">{empty}</p>
  return (
    <ul className="lb-reqs">
      {rows.map((r) => {
        const open = r.status === 'out' || r.status === 'viewed'
        return (
          <li key={r.id} className={`lb-req${r.status === 'void' ? ' is-void' : ''}`}>
            <div className="lb-req-main">
              <span className="stack gap-2px min0">
                <strong>{r.title}</strong>
                <span className="small">
                  {r.signer} <span className="muted">· {r.email}</span>
                </span>
                {showProject && (
                  <span className="muted small">
                    {r.projectHref ? <a className="text-link-plain" href={r.projectHref}>{r.project}</a> : (r.project ?? 'No project')}
                    {r.audience === 'client' ? ' · in their portal' : ' · own link'}
                  </span>
                )}
              </span>
              {!(steps && r.status !== 'void') && <span className={`pill pill-doc-${r.status}`}>{statusLabel[r.status]}</span>}
            </div>
            {steps && r.status !== 'void' ? (
              <StepBar
                compact
                label={`${statusLabel[r.status]}. Sent ${day(r.createdAt)}${r.emailedAt ? `, emailed ${day(r.emailedAt)}` : ', link only'}${r.viewedAt ? `, opened ${day(r.viewedAt)}` : ''}${r.signedAt ? `, signed ${day(r.signedAt)}` : ''}`}
                steps={[
                  { key: 'sent', label: 'Sent', on: true, when: `${day(r.createdAt)}${r.emailedAt ? '' : ' · link'}` },
                  { key: 'opened', label: 'Opened', on: Boolean(r.viewedAt || r.signedAt), when: r.viewedAt ? day(r.viewedAt) : '' },
                  { key: 'signed', label: 'Signed', on: r.status === 'signed', when: r.signedAt ? day(r.signedAt) : '' },
                ]}
              />
            ) : (
            <p className="lb-req-dates muted small">
              Sent {day(r.createdAt)}
              {r.emailedAt ? ` · emailed ${day(r.emailedAt)}` : ' · link only'}
              {r.viewedAt ? ` · opened ${day(r.viewedAt)}` : open ? ' · not opened yet' : ''}
              {r.signedAt ? ` · signed ${day(r.signedAt)}` : ''}
              {r.voidedAt ? ` · withdrawn ${day(r.voidedAt)}` : ''}
            </p>
            )}
            <div className="lb-req-actions">
              {r.status === 'signed' && r.pdfHref ? (
                <a className="btn btn-primary btn-sm" href={r.pdfHref} target="_blank" rel="noopener noreferrer">View signed<span className="sr-only"> {r.title} by {r.signer} (opens the PDF in a new tab)</span></a>
              ) : (
                <a className="btn btn-secondary btn-sm" href={r.viewHref} target="_blank" rel="noopener noreferrer">View<span className="sr-only"> {r.title} for {r.signer} as they see it (opens in a new tab)</span></a>
              )}
              {open && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={async () => setMsg({ id: r.id, text: (await copy(r.link)) ? 'Link copied.' : r.link })}>
                    Copy link<span className="sr-only"> for {r.signer}</span>
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => act(r, 'email')}>
                    {busy === `email-${r.id}` ? 'Sending…' : r.emailedAt ? 'Email again' : 'Email it'}<span className="sr-only"> to {r.signer}</span>
                  </button>
                  {confirmVoid === r.id ? (
                    <span className="row-wrap lb-confirm">
                      <span className="small">Withdraw it? The link stops working.</span>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => act(r, 'void')}>{busy === `void-${r.id}` ? 'Withdrawing…' : 'Yes, withdraw'}</button>
                      <button type="button" className="linklike small" onClick={() => setConfirmVoid('')}>Keep it</button>
                    </span>
                  ) : (
                    <button type="button" className="linklike small" onClick={() => setConfirmVoid(r.id)}>Void<span className="sr-only"> {r.title} for {r.signer}</span></button>
                  )}
                </>
              )}
            </div>
            {msg?.id === r.id && <p className={`small ${msg.err ? 'err' : 'muted'} m0 wrap-any`} role="status">{msg.text}</p>}
          </li>
        )
      })}
    </ul>
  )
}

/* ── Send a document ──────────────────────────────────────────────────── */

type SendProps = {
  templates: SendTemplate[]
  projects: SendProject[]
  /** From a project's Documents tab: the project is set. */
  projectId?: string
  /** From the Library: the document is set. */
  templateId?: string
  onDone?: () => void
}

export function SendDocument({ templates, projects, projectId: fixedProject, templateId: fixedTemplate, onDone }: SendProps) {
  const router = useRouter()
  const uid = useId()
  const [tid, setTid] = useState(fixedTemplate ?? (templates.length === 1 ? templates[0].id : ''))
  const [pid, setPid] = useState(fixedProject ?? '')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [contact, setContact] = useState('')
  const [person, setPerson] = useState({ name: '', email: '' })
  const [state, setState] = useState<{ busy?: string; err?: string; done?: { link: string; text: string } }>({})

  const t = templates.find((x) => x.id === tid)
  const p = projects.find((x) => x.id === pid)
  if (!templates.length)
    return <p className="muted small a-empty">No documents are ready to send. In the Library, paste a document’s wording and press Approve wording.</p>

  const ownerFields = t?.fields.filter((f) => f.who === 'owner') ?? []
  const value = (f: DocField) => vals[f.key] ?? f.default ?? ''
  const values = { ...Object.fromEntries(ownerFields.map((f) => [f.key, value(f)])), ...(p ? { project: p.title, ...(p.hasClient ? { client: p.org } : {}) } : {}) }
  const missing = [
    !t && 'the document',
    t && !p && !t.projectOptional && 'the project',
    ...ownerFields.filter((f) => !value(f).trim()).map((f) => `“${f.label}”`),
    t?.audience === 'client' && !contact && 'who signs',
    t?.audience === 'person' && (person.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())) && 'the signer’s name and email',
  ].filter(Boolean) as string[]

  async function create(email: boolean) {
    if (missing.length || state.busy) return
    setState({ busy: email ? 'email' : 'link' })
    const j = await post({
      action: 'create',
      templateId: tid,
      projectId: pid || undefined,
      values: Object.fromEntries(ownerFields.map((f) => [f.key, value(f)])),
      recipient: t!.audience === 'client' ? { contactKey: contact } : person,
      email,
    })
    if (!j.ok) return setState({ err: j.message ?? 'That didn’t work. Try again.' })
    let text = 'Created.'
    if (email) {
      text = j.emailed?.ok ? (j.emailed.simulated ? 'Created. Sample mode: the email was simulated, nothing was sent.' : 'Created and emailed.') : `Created, but ${j.emailed?.message ?? 'the email didn’t go.'}`
    } else {
      text = (await copy(j.link)) ? 'Created, and the link is copied.' : 'Created. Copy the link below.'
      if (j.sample) text += ' Sample data: kept only until the app restarts.'
    }
    setState({ done: { link: j.link, text } })
    router.refresh()
  }

  if (state.done)
    return (
      <div className="stack lb-sent" role="status">
        <p className="m0"><strong>{state.done.text}</strong></p>
        <p className="small lb-link"><a className="text-link" href={state.done.link} target="_blank" rel="noopener noreferrer">{state.done.link}<span className="sr-only"> (opens in a new tab)</span></a></p>
        <div className="row-wrap">
          <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { if (await copy(state.done!.link)) setState({ done: { ...state.done!, text: 'Link copied.' } }) }}>Copy link</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setState({}); setVals({}); setContact(''); setPerson({ name: '', email: '' }); if (!fixedTemplate) setTid(''); onDone?.() }}>Send another</button>
        </div>
      </div>
    )

  return (
    <form className="stack lb-send" onSubmit={(e) => { e.preventDefault(); create(false) }} aria-label="Send a document">
      {!fixedTemplate && (
        <div className="field">
          <label htmlFor={`${uid}-t`}>Document</label>
          <select id={`${uid}-t`} className="input" value={tid} onChange={(e) => { setTid(e.target.value); setVals({}); setContact('') }}>
            <option value="">Choose a document…</option>
            {templates.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.audience === 'client' ? 'client signs in portal' : 'one person, own link'}</option>)}
          </select>
          <span className="hint">Only documents with approved wording are listed.</span>
        </div>
      )}

      {!fixedProject && (
        <div className="field">
          <label htmlFor={`${uid}-p`}>Project{t?.projectOptional ? <span className="muted small"> (optional)</span> : ''}</label>
          <select id={`${uid}-p`} className="input" value={pid} onChange={(e) => { setPid(e.target.value); setContact('') }}>
            <option value="">{t?.projectOptional ? 'No project' : 'Choose a project…'}</option>
            {projects.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.org}</option>)}
          </select>
        </div>
      )}

      {t && ownerFields.length > 0 && (
        <fieldset className="lb-fs">
          <legend>Fill in before sending</legend>
          {ownerFields.map((f) => (
            <div key={f.key} className="field">
              <label htmlFor={`${uid}-f-${f.key}`}>{f.label}</label>
              {f.type === 'choice' ? (
                <select id={`${uid}-f-${f.key}`} className="input" value={value(f)} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>
                  <option value="">Choose…</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input id={`${uid}-f-${f.key}`} className="input" type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'money' ? 'decimal' : undefined} value={value(f)} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} maxLength={300} />
              )}
            </div>
          ))}
        </fieldset>
      )}

      {t?.audience === 'client' && (
        <fieldset className="lb-fs">
          <legend>Who signs</legend>
          {!p ? (
            <p className="muted small a-empty">Choose the project first.</p>
          ) : !p.contacts.length ? (
            <p className="muted small a-empty">This client has no contacts with an email. Add one to the client in the editor.</p>
          ) : (
            p.contacts.map((c) => (
              <label key={c.key} className="lb-radio">
                <input type="radio" name={`${uid}-c`} value={c.key} checked={contact === c.key} onChange={() => setContact(c.key)} />
                <span>{c.name} <span className="muted small">· {c.email}</span></span>
              </label>
            ))
          )}
          <span className="hint">They sign inside their client portal. Any of {p?.org ?? 'the client'}’s contacts can open it there.</span>
        </fieldset>
      )}
      {t?.audience === 'person' && (
        <fieldset className="lb-fs">
          <legend>Who signs</legend>
          <div className="lb-two">
            <div className="field">
              <label htmlFor={`${uid}-n`}>Name</label>
              <input id={`${uid}-n`} className="input" autoComplete="off" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} maxLength={100} />
            </div>
            <div className="field">
              <label htmlFor={`${uid}-e`}>Email</label>
              <input id={`${uid}-e`} className="input" type="email" autoComplete="off" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} maxLength={200} />
            </div>
          </div>
          <span className="hint">A participant, crew member or anyone else. They sign through their own private link and never see a client portal.</span>
        </fieldset>
      )}

      {t && (
        <details className="lb-preview" open>
          <summary>Preview: exactly what {t.audience === 'client' ? 'the client' : 'the signer'} will read</summary>
          <div className="lb-preview-doc">
            <h3 className="lb-preview-title">{t.title}</h3>
            <DocText body={t.body} fields={t.fields} values={values} live choicesInline />
          </div>
          <p className="muted small m0">Underlined gaps are what the signer fills in. Their name goes in when they sign.</p>
        </details>
      )}

      {state.err && <p className="err small m0" role="alert">{state.err}</p>}
      {missing.length > 0 && t && <p className="muted small m0">Still needed: {missing.join(', ')}.</p>}
      <div className="row-wrap">
        <button type="submit" className="btn btn-primary btn-sm" disabled={missing.length > 0 || Boolean(state.busy)}>{state.busy === 'link' ? 'Creating…' : 'Create and copy link'}</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={missing.length > 0 || Boolean(state.busy)} onClick={() => create(true)}>{state.busy === 'email' ? 'Sending…' : 'Create and email'}</button>
      </div>
      <p className="muted small m0">Nothing is emailed unless you press Create and email. The text is frozen as it is now, so later edits in the Library don’t change it.</p>
    </form>
  )
}

/** A button that opens the send form in place. Secondary unless `primary` (when it's the one main action on the view). */
export function SendDocumentToggle({ primary, ...props }: SendProps & { label?: string; primary?: boolean }) {
  const [open, setOpen] = useState(false)
  const uid = useId()
  return (
    <div className="stack gap-3">
      <div>
        <button type="button" className={`btn btn-sm ${open || !primary ? 'btn-secondary' : 'btn-primary'}`} aria-expanded={open} aria-controls={uid} onClick={() => setOpen(!open)}>
          {open ? 'Close' : (props.label ?? 'Send a document')}
        </button>
      </div>
      {open && (
        <div id={uid} className="lb-send-wrap">
          <SendDocument {...props} />
        </div>
      )}
    </div>
  )
}
