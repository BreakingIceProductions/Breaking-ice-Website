'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'
import { fillTemplate, forStage, LIMITS, parseRecipients, PLACEHOLDERS, type EmailTemplate, type SentEmail, type TemplateVars } from '../email-templates-shared'

type Reply = { sample?: boolean; message?: string; warning?: string; html?: string; template?: EmailTemplate }
const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as Reply }))
    .catch(() => ({ ok: false, status: 0, data: { message: 'No connection. Try again.' } as Reply }))

const failed = (status: number, message?: string) =>
  message || (status === 401 ? 'This sign-in can’t change things, or it has expired.' : 'That didn’t work. Reload the page and try again.')
const SAMPLE_SENT = 'Sample data: nothing was sent.'
const SAMPLE_SAVED = 'Sample data: nothing was saved.'
const NOT_APPROVED = 'Wording not approved yet — check it before sending.'
const stageTitle = (v?: string) => PIPELINE_STAGES.find((s) => s.value === v)?.title
const KNOWN = new Set(PLACEHOLDERS.map((p) => p.key))
/** Placeholders still in the text (nothing to fill them with), so they can be pointed out before sending. */
const leftovers = (...texts: string[]) => [...new Set(texts.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => KNOWN.has(k))))]

/** The branded email as the server builds it, a moment after typing stops. Nothing is sent. */
function usePreview(subject: string, body: string, on: boolean) {
  const [html, setHtml] = useState('')
  const [bad, setBad] = useState(false)
  useEffect(() => {
    if (!on) return
    let stale = false
    const t = setTimeout(async () => {
      const r = await post('/api/admin/email', { action: 'preview', subject, body })
      if (stale) return
      if (r.ok && r.data.html) {
        setHtml(r.data.html)
        setBad(false)
      } else setBad(true)
    }, 400)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [subject, body, on])
  return { html, bad }
}

function PreviewFrame({ html, bad, title }: { html: string; bad?: boolean; title: string }) {
  return (
    <div className="stack em-preview" aria-label="Live preview">
      <span className="a-round-label">Preview</span>
      {html ? <iframe className="lb-email-frame em-frame" title={title} srcDoc={html} sandbox="" /> : <p className="lb-empty-body">{bad ? 'The preview couldn’t be built. You can still send.' : 'Building the preview…'}</p>}
    </div>
  )
}

/* ── The composer ────────────────────────────────────────────────────── */

export type ComposerProps = {
  projectId: string
  /** Who it goes to at first (editable): the lead's or the client contact's address. */
  to?: string
  stage: string
  templates: EmailTemplate[]
  vars: TemplateVars
  /** Opens straight away (the board's Email link adds ?email=1). */
  startOpen?: boolean
  label?: string
  small?: boolean
}

/**
 * An "Email" button and its dialog: pick a template (or start blank), change anything, check the
 * branded preview, then press Send. Goes out from Josh's address through the site's sender; replies go to Josh.
 * Nothing is ever sent without the Send press on the confirm step.
 */
export function EmailComposer({ projectId, to: initialTo = '', stage, templates, vars, startOpen = false, label = 'Email', small = true }: ComposerProps) {
  const router = useRouter()
  const uid = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const ordered = forStage(templates, stage)
  const first = templates.find((t) => t.stage === stage)
  const [open, setOpen] = useState(startOpen)
  const [to, setTo] = useState(initialTo)
  const [pick, setPick] = useState(first?._key ?? '')
  const [subject, setSubject] = useState(first ? fillTemplate(first.subject, vars) : '')
  const [body, setBody] = useState(first ? fillTemplate(first.body, vars) : '')
  const [dirty, setDirty] = useState(false)
  const [step, setStep] = useState<'edit' | 'confirm' | 'done'>('edit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const preview = usePreview(subject, body, open)

  useEffect(() => {
    const d = dialog.current
    if (open && d && !d.open) d.showModal()
  }, [open])

  const chosen = templates.find((t) => t._key === pick)
  const recipients = parseRecipients(to)
  const unfilled = leftovers(subject, body)
  const toError = recipients.invalid.length
    ? `${recipients.invalid.join(', ')} doesn’t look like an email address.`
    : recipients.valid.length > LIMITS.to
      ? `Up to ${LIMITS.to} people per email.`
      : ''
  const ready = recipients.valid.length > 0 && !toError && subject.trim() && body.trim()
  const toLine = recipients.valid.length <= 2 ? recipients.valid.join(' and ') : `${recipients.valid.length} people`

  function reset() {
    setTo(initialTo)
    setPick(first?._key ?? '')
    setSubject(first ? fillTemplate(first.subject, vars) : '')
    setBody(first ? fillTemplate(first.body, vars) : '')
    setDirty(false)
    setStep('edit')
    setError('')
    setDone('')
  }

  function choose(key: string) {
    if (dirty && !confirm('Replace what you’ve written with this template?')) return
    const t = templates.find((x) => x._key === key)
    setPick(key)
    setSubject(t ? fillTemplate(t.subject, vars) : '')
    setBody(t ? fillTemplate(t.body, vars) : '')
    setDirty(false)
  }

  async function send() {
    setBusy(true)
    setError('')
    const r = await post('/api/admin/email', { projectId, to: recipients.valid, subject, body, template: chosen?.name })
    setBusy(false)
    if (!r.ok) return setError(failed(r.status, r.data.message))
    setStep('done')
    setDone(r.data.sample ? SAMPLE_SENT : r.data.warning || 'Sent.')
    if (!r.data.sample) router.refresh()
  }

  function onClosed() {
    setOpen(false)
    reset()
    // Opened from the board's link: drop ?email=1 so a reload doesn't open it again.
    const u = new URL(window.location.href)
    if (u.searchParams.has('email')) {
      u.searchParams.delete('email')
      window.history.replaceState(null, '', u)
    }
  }

  const close = () => dialog.current?.close()
  const here = ordered.filter((t) => t.stage === stage)
  const rest = ordered.filter((t) => t.stage !== stage)

  return (
    <>
      <button type="button" className={`btn btn-secondary${small ? ' btn-sm' : ''}`} onClick={() => setOpen(true)}>{label}</button>
      <dialog ref={dialog} className="a-dialog em-dialog" aria-labelledby={`${uid}-h`} onClose={onClosed}>
        {open && (
          <div className="a-dialog-body">
            <span className="eyebrow">{step === 'done' ? 'Done' : step === 'confirm' ? 'Check and send' : 'Email · nothing is sent until you press Send'}</span>
            <h2 id={`${uid}-h`} className="a-h2 a-h2-lg">{step === 'done' ? done : step === 'confirm' ? `Send to ${toLine}?` : 'Write an email'}</h2>

            {step === 'edit' && (
              <div className="em-split">
                <div className="stack em-form">
                  <div className="field">
                    <label htmlFor={`${uid}-to`}>To</label>
                    <input id={`${uid}-to`} className="input" type="text" inputMode="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} aria-describedby={`${uid}-to-h`} aria-invalid={Boolean(toError) || undefined} />
                    <span id={`${uid}-to-h`} className="hint">{toError ? <span className="err">{toError}</span> : 'Separate more than one address with commas.'}</span>
                  </div>
                  <div className="field">
                    <label htmlFor={`${uid}-t`}>Start from</label>
                    <select id={`${uid}-t`} className="input" value={pick} onChange={(e) => choose(e.target.value)}>
                      <option value="">A blank email</option>
                      {here.length > 0 && (
                        <optgroup label={`For ${stageTitle(stage) ?? 'this stage'}`}>
                          {here.map((t) => <option key={t._key} value={t._key}>{t.name}{t.approved ? '' : ' (not approved)'}</option>)}
                        </optgroup>
                      )}
                      {rest.length > 0 && (
                        <optgroup label={here.length ? 'Other templates' : 'Templates'}>
                          {rest.map((t) => <option key={t._key} value={t._key}>{t.name}{t.approved ? '' : ' (not approved)'}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  {chosen && !chosen.approved && (
                    <p className="a-warning">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.5" /></svg>
                      <span>{NOT_APPROVED}</span>
                    </p>
                  )}
                  <div className="field">
                    <label htmlFor={`${uid}-s`}>Subject</label>
                    <input id={`${uid}-s`} className="input" value={subject} maxLength={LIMITS.subject} onChange={(e) => { setSubject(e.target.value); setDirty(true) }} />
                  </div>
                  <div className="field">
                    <label htmlFor={`${uid}-b`}>Email</label>
                    <textarea id={`${uid}-b`} className="input em-body" value={body} maxLength={LIMITS.body} spellCheck onChange={(e) => { setBody(e.target.value); setDirty(true) }} aria-describedby={`${uid}-b-h`} />
                    <span id={`${uid}-b-h`} className="hint">A blank line starts a new paragraph. Web addresses become links.</span>
                  </div>
                  {unfilled.length > 0 && <p className="small a-urgent" style={{ margin: 0 }}>Still has {unfilled.map((k) => `{${k}}`).join(', ')} in it, with nothing to fill it with. Replace it before sending.</p>}
                </div>
                <PreviewFrame html={preview.html} bad={preview.bad} title="Preview of the email" />
              </div>
            )}

            {step === 'confirm' && (
              <>
                <dl className="key-dates">
                  <div><dt>To</dt><dd>{recipients.valid.join(', ')}</dd></div>
                  <div><dt>Subject</dt><dd>{subject}</dd></div>
                  {chosen && <div><dt>Template</dt><dd>{chosen.name}{chosen.approved ? '' : ' · not approved'}</dd></div>}
                </dl>
                {chosen && !chosen.approved && <p className="small a-urgent" style={{ margin: 0 }}>{NOT_APPROVED}</p>}
                {unfilled.length > 0 && <p className="small a-urgent" style={{ margin: 0 }}>It still has {unfilled.map((k) => `{${k}}`).join(', ')} in it.</p>}
                <p className="small" style={{ margin: 0 }}>It goes out now from your address, with the Breaking Ice header and footer. Replies come to you.</p>
                <PreviewFrame html={preview.html} bad={preview.bad} title="Preview of the email" />
              </>
            )}

            {error && <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>}

            <div className="btn-row a-dialog-actions">
              {step === 'edit' && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                  <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => { setError(''); setStep('confirm') }}>Check and send</button>
                </>
              )}
              {step === 'confirm' && (
                <>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStep('edit')}>Back</button>
                  <button type="button" className="btn btn-primary" disabled={busy || !ready} onClick={send}>{busy ? 'Sending…' : `Send to ${toLine}`}</button>
                </>
              )}
              {step === 'done' && <button type="button" className="btn btn-primary" onClick={close} autoFocus>Done</button>}
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}

/* ── What's been sent ────────────────────────────────────────────────── */

const sentDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' })

/** Emails sent from the composer on this project, newest first. Open one to read what went out. */
export function SentEmails({ emails }: { emails: SentEmail[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? emails : emails.slice(0, 5)
  return (
    <section className="p-card" aria-labelledby="em-h-sent">
      <h2 id="em-h-sent" className="a-h2">Emails sent</h2>
      {emails.length ? (
        <ul className="a-feed ld-feed em-sent">
          {shown.map((e) => (
            <li key={e._key}>
              <details>
                <summary>
                  <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <span>{e.subject}</span>
                    <span className="muted small">To {e.to.join(', ')}</span>
                  </span>
                </summary>
                <pre className="em-sent-body">{e.body}</pre>
              </details>
              <span className="muted small ld-when">{sentDay(e.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small a-empty">None yet. Emails you send with the Email button show here.</p>
      )}
      {emails.length > 5 && (
        <button type="button" className="linklike small ld-more" aria-expanded={all} onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show ${emails.length - 5} earlier`}</button>
      )}
    </section>
  )
}

/* ── The Library's template editor ───────────────────────────────────── */

const STAGE_OPTIONS = PIPELINE_STAGES.map((s) => ({ value: s.value, title: s.title }))

export function TemplateChip({ t }: { t: EmailTemplate }) {
  return t.approved ? <span className="pill pill-doc-signed">Approved</span> : <span className="pill pill-doc-check">Needs your check</span>
}

/**
 * Every composer template: a list on the left, the chosen one on the right with its branded preview
 * (filled with made-up details). Add, edit, approve and delete; view-only sign-ins only read.
 * `previews` are built on the server, so they show without a request.
 */
export function EmailTemplates({ templates: initial, saved, previews, sampleVars, readOnly }: { templates: EmailTemplate[]; saved: boolean; previews: Record<string, string>; sampleVars: TemplateVars; readOnly?: boolean; /** Sample mode: saves are answered but nothing is kept. */ sample?: boolean }) {
  const router = useRouter()
  const [templates, setTemplates] = useState(initial)
  const [current, setCurrent] = useState<string | null>(initial[0]?._key ?? null)
  const [editing, setEditing] = useState<EmailTemplate | 'new' | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean }>()
  const [busy, setBusy] = useState(false)
  // Fresh data from the server replaces local changes (after a save and refresh).
  useEffect(() => setTemplates(initial), [initial])

  const t = templates.find((x) => x._key === current) ?? templates[0]
  const live = usePreview(t ? fillTemplate(t.subject, sampleVars) : '', t ? fillTemplate(t.body, sampleVars) : '', Boolean(t && !previews[t._key] && !readOnly && !editing))
  const html = t ? previews[t._key] ?? live.html : ''

  async function act(action: 'approve' | 'unapprove' | 'delete') {
    if (!t) return
    if (action === 'delete' && !confirm(`Delete “${t.name}”? It can’t be brought back.`)) return
    setBusy(true)
    const r = await post('/api/admin/email-templates', { action, key: t._key })
    setBusy(false)
    if (!r.ok) return setMsg({ text: failed(r.status, r.data.message), err: true })
    if (action === 'delete') {
      setTemplates((list) => list.filter((x) => x._key !== t._key))
      setCurrent(null)
    } else setTemplates((list) => list.map((x) => (x._key === t._key ? { ...x, approved: action === 'approve' } : x)))
    setMsg({ text: r.data.sample ? SAMPLE_SAVED : action === 'delete' ? 'Deleted.' : action === 'approve' ? 'Approved.' : 'Back to Needs your check.' })
    if (!r.data.sample) router.refresh()
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <p className="muted small" style={{ margin: 0 }}>
        Starting points for the Email button on lead and project pages. Fill-ins like {'{firstName}'} are replaced when you pick one. Any template can be used, but one that isn’t approved shows a note to check the wording first.
        {!saved && ' These are the starters: nothing is saved until you change one.'}
      </p>
      <div className="lb-split">
        <nav className="lb-list" aria-label="Email templates">
          <div className="lb-group">
            <ul>
              {templates.map((x) => (
                <li key={x._key}>
                  <a href={`#tpl-${x._key}`} aria-current={x._key === t?._key && editing !== 'new' ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setCurrent(x._key); setEditing(null); setMsg(undefined) }}>
                    <span>{x.name}</span>
                    <TemplateChip t={x} />
                  </a>
                </li>
              ))}
            </ul>
            {!templates.length && <p className="muted small a-empty">No templates yet.</p>}
          </div>
          {!readOnly && <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditing('new'); setMsg(undefined) }}>New template</button></div>}
        </nav>

        {editing ? (
          <TemplateForm
            key={editing === 'new' ? 'new' : editing._key}
            template={editing === 'new' ? undefined : editing}
            sampleVars={sampleVars}
            onCancel={() => setEditing(null)}
            onSaved={(next, wasSample) => {
              setTemplates((list) => (list.some((x) => x._key === next._key) ? list.map((x) => (x._key === next._key ? next : x)) : [...list, next]))
              setCurrent(next._key)
              setEditing(null)
              setMsg({ text: wasSample ? SAMPLE_SAVED : next.approved ? 'Saved.' : 'Saved. It needs your check before it reads as approved.' })
              if (!wasSample) router.refresh()
            }}
          />
        ) : t ? (
          <section className="p-card lb-panel" id={`tpl-${t._key}`} aria-labelledby="em-tpl-h">
            <div className="a-card-head">
              <h2 id="em-tpl-h" className="a-h2 a-h2-lg">{t.name}</h2>
              <TemplateChip t={t} />
            </div>
            <dl className="key-dates">
              <div><dt>Subject</dt><dd>{t.subject}</dd></div>
              <div><dt>Listed first for</dt><dd>{stageTitle(t.stage) ?? 'Any stage'}</dd></div>
            </dl>
            <PreviewFrame html={html} bad={live.bad} title={`Preview of the “${t.name}” template`} />
            <details className="lb-email-text">
              <summary className="small">The wording, with its fill-ins</summary>
              <pre>{t.body}</pre>
            </details>
            {msg && <p className={`small ${msg.err ? 'err' : ''}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}
            {!readOnly && (
              <div className="row-wrap">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setMsg(undefined); setEditing(t) }}>Edit</button>
                {!t.approved && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => act('approve')}>Approve wording</button>}
                {t.approved && <button type="button" className="linklike small" disabled={busy} onClick={() => act('unapprove')}>Undo approval</button>}
                <button type="button" className="linklike small" disabled={busy} onClick={() => act('delete')}>Delete</button>
              </div>
            )}
            <p className="muted small" style={{ margin: 0 }}>The preview uses made-up details. Sending happens only from a lead or project page, when you press Send.</p>
          </section>
        ) : (
          <section className="p-card lb-panel">
            {msg && <p className={`small ${msg.err ? 'err' : ''}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}
            <p className="muted small a-empty">{readOnly ? 'No templates.' : 'Pick a template, or add a new one.'}</p>
          </section>
        )}
      </div>
    </div>
  )
}

function TemplateForm({ template, sampleVars, onCancel, onSaved }: { template?: EmailTemplate; sampleVars: TemplateVars; onCancel: () => void; onSaved: (t: EmailTemplate, sample: boolean) => void }) {
  const uid = useId()
  const [name, setName] = useState(template?.name ?? '')
  const [stage, setStage] = useState<string>(template?.stage ?? '')
  const [subject, setSubject] = useState(template?.subject ?? '')
  const [body, setBody] = useState(template?.body ?? 'Hi {firstName},\n\n\n\n{signOff}')
  const [state, setState] = useState<{ busy?: boolean; err?: string }>({})
  const preview = usePreview(fillTemplate(subject, sampleVars), fillTemplate(body, sampleVars), true)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState({ busy: true })
    const r = await post('/api/admin/email-templates', { action: 'save', key: template?._key, name, stage, subject, body })
    if (!r.ok || !r.data.template) return setState({ err: failed(r.status, r.data.message) })
    onSaved(r.data.template, Boolean(r.data.sample))
  }

  return (
    <form className="p-card lb-panel stack" onSubmit={submit} aria-labelledby={`${uid}-h`}>
      <div className="a-card-head">
        <h2 id={`${uid}-h`} className="a-h2 a-h2-lg">{template ? `Edit: ${template.name}` : 'New template'}</h2>
      </div>
      <div className="lb-two">
        <div className="field">
          <label htmlFor={`${uid}-n`}>Name</label>
          <input id={`${uid}-n`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.name} required />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-st`}>Listed first for</label>
          <select id={`${uid}-st`} className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">Any stage</option>
            {STAGE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.title}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-s`}>Subject</label>
        <input id={`${uid}-s`} className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={LIMITS.subject} required />
      </div>
      <div className="lb-editor">
        <div className="field">
          <label htmlFor={`${uid}-b`}>Wording</label>
          <textarea id={`${uid}-b`} className="input lb-textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={LIMITS.body} spellCheck required aria-describedby={`${uid}-b-h`} />
          <span id={`${uid}-b-h`} className="hint">
            A blank line starts a new paragraph. Fill-ins: {PLACEHOLDERS.map((p) => `{${p.key}}`).join(', ')}. A line like [button: Open your portal]({'{portalUrl}'}) becomes a button.
          </span>
        </div>
        <PreviewFrame html={preview.html} bad={preview.bad} title="Live preview of the template" />
      </div>
      <p className="muted small" style={{ margin: 0 }}>Changing the subject or wording sets it back to Needs your check.</p>
      {state.err && <p className="err small" role="alert" style={{ margin: 0 }}>{state.err}</p>}
      <div className="row-wrap">
        <button type="submit" className="btn btn-primary btn-sm" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
