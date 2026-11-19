'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'
import { fillTemplate, forStage, LIMITS, parseRecipients, PLACEHOLDERS, type EmailTemplate, type SentEmail, type TemplateVars } from '../email-templates-shared'
import { blockTokens, inlineTokens, insertToken, tidyTokens, type BlockOption } from '../email-blocks-shared'

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

/**
 * The branded email as the server builds it, a moment after typing stops. Nothing is sent.
 * With a project, portal blocks are filled from it; `message` says why a block can't be (it won't send either).
 */
function usePreview(subject: string, body: string, on: boolean, projectId?: string) {
  const [html, setHtml] = useState('')
  const [bad, setBad] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!on) return
    let stale = false
    const t = setTimeout(async () => {
      const r = await post('/api/admin/email', { action: 'preview', projectId, subject, body })
      if (stale) return
      if (r.ok && r.data.html) {
        setHtml(r.data.html)
        setBad(false)
        setMessage('')
      } else {
        setBad(true)
        setMessage(r.status === 400 && r.data.message ? r.data.message : '')
      }
    }, 400)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [subject, body, on, projectId])
  return { html, bad, message }
}

function PreviewFrame({ html, bad, message, title }: { html: string; bad?: boolean; message?: string; title: string }) {
  return (
    <div className="stack em-preview" aria-label="Live preview">
      <span className="a-round-label">Preview</span>
      {message && <p className="small err" role="alert" style={{ margin: 0 }}>{message}</p>}
      {html && !message ? <iframe className="lb-email-frame em-frame" title={title} srcDoc={html} sandbox="" /> : !message && <p className="lb-empty-body">{bad ? 'The preview couldn’t be built. You can still send.' : 'Building the preview…'}</p>}
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
  /** Pieces of this project's portal that can be dropped into the email. */
  blocks?: BlockOption[]
  /** Granola is connected, so "Draft from a call" can list recent calls. */
  granola?: boolean
  /** Opens straight away (the board's Email link adds ?email=1). */
  startOpen?: boolean
  label?: string
  small?: boolean
}

const DRAFTED = 'Drafted from call'
const BLOCK_KIND: Record<BlockOption['kind'], string> = { portal: 'Sign-in', version: 'Version', quote: 'Quote', sign: 'To sign', finals: 'Finals', payment: 'Payment' }

/**
 * An "Email" button and its panel, docked on the right so the page stays usable beside it:
 * pick a template (or start blank, or draft one from a call), drop in pieces of the client portal,
 * check the branded preview, then press Send. Goes out from Josh's address through the site's sender;
 * replies go to Josh. Nothing is ever sent without the Send press on the confirm step.
 */
export function EmailComposer({ projectId, to: initialTo = '', stage, templates, vars, blocks = [], granola = false, startOpen = false, label = 'Email', small = true }: ComposerProps) {
  const router = useRouter()
  const uid = useId()
  const panel = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const caret = useRef<number | undefined>(undefined)
  const dropped = useRef(false)
  const ordered = forStage(templates, stage)
  const first = templates.find((t) => t.stage === stage)
  const [open, setOpen] = useState(startOpen)
  const [to, setTo] = useState(initialTo)
  const [pick, setPick] = useState(first?._key ?? '')
  const [subject, setSubject] = useState(first ? fillTemplate(first.subject, vars) : '')
  const [body, setBody] = useState(first ? fillTemplate(first.body, vars) : '')
  const [dirty, setDirty] = useState(false)
  const [drafted, setDrafted] = useState<{ warning?: string } | null>(null)
  const [view, setView] = useState<'write' | 'preview'>('write')
  const [step, setStep] = useState<'edit' | 'confirm' | 'done'>('edit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [said, setSaid] = useState('')
  const [dropping, setDropping] = useState(false)
  const preview = usePreview(subject, body, open && (view === 'preview' || step === 'confirm'), projectId)

  const chosen = templates.find((t) => t._key === pick)
  const recipients = parseRecipients(to)
  const unfilled = leftovers(subject, body)
  const known = new Set(blocks.map((b) => b.token))
  const inBody = new Set(blockTokens(body))
  const strange = [...inBody].filter((t) => !known.has(t))
  const inline = inlineTokens(body)
  const toError = recipients.invalid.length
    ? `${recipients.invalid.join(', ')} doesn’t look like an email address.`
    : recipients.valid.length > LIMITS.to
      ? `Up to ${LIMITS.to} people per email.`
      : ''
  const ready = recipients.valid.length > 0 && !toError && subject.trim() && body.trim() && !inline.length
  const toLine = recipients.valid.length <= 2 ? recipients.valid.join(' and ') : `${recipients.valid.length} people`
  const templateName = drafted ? DRAFTED : chosen?.name

  useEffect(() => {
    const d = panel.current
    if (!open || !d) return
    if (!d.open) d.show()
    document.documentElement.classList.add('em-docked')
    heading.current?.focus()
    return () => document.documentElement.classList.remove('em-docked')
  }, [open])

  function reset() {
    setTo(initialTo)
    setPick(first?._key ?? '')
    setSubject(first ? fillTemplate(first.subject, vars) : '')
    setBody(first ? fillTemplate(first.body, vars) : '')
    setDirty(false)
    setDrafted(null)
    setView('write')
    setStep('edit')
    setError('')
    setDone('')
    setSaid('')
  }

  function choose(key: string) {
    if (dirty && !confirm('Replace what you’ve written with this template?')) return
    const t = templates.find((x) => x._key === key)
    setPick(key)
    setSubject(t ? fillTemplate(t.subject, vars) : '')
    setBody(t ? fillTemplate(t.body, vars) : '')
    setDirty(false)
    setDrafted(null)
  }

  function fillDraft(d: { subject: string; body: string; warning?: string }) {
    if ((subject.trim() || body.trim()) && !confirm('Replace the subject and email with Claude’s draft?')) return false
    setSubject(d.subject)
    setBody(d.body)
    setPick('')
    setDirty(true)
    setDrafted({ warning: d.warning })
    setView('write')
    setSaid('Claude’s draft is in the subject and email. Read it before sending.')
    return true
  }

  function addBlock(b: BlockOption) {
    // With no cursor in the text yet, it goes above the last paragraph (the sign-off), not under it.
    const lastBreak = body.trimEnd().lastIndexOf('\n\n')
    const r = insertToken(body, b.token, caret.current ?? (lastBreak > 0 ? lastBreak : undefined))
    setBody(r.body)
    setDirty(true)
    caret.current = r.caret
    setSaid(`Added ${b.label} to the email.`)
  }

  function removeBlock(b: BlockOption) {
    setBody((t) => t.split('\n').filter((line) => line.trim() !== b.token).join('\n').replace(/\n{3,}/g, '\n\n').trim())
    setDirty(true)
    setSaid(`Took ${b.label} out of the email.`)
  }

  async function send() {
    setBusy(true)
    setError('')
    const r = await post('/api/admin/email', { projectId, to: recipients.valid, subject, body, template: templateName })
    setBusy(false)
    if (!r.ok) return setError(failed(r.status, r.data.message))
    setStep('done')
    setDone(r.data.sample ? SAMPLE_SENT : r.data.warning || 'Sent.')
    if (!r.data.sample) router.refresh()
  }

  function requestClose() {
    if (step === 'edit' && dirty && (subject.trim() || body.trim()) && !confirm('Close without sending? What you’ve written will be lost.')) return
    panel.current?.close()
  }

  // Esc closes it, like a dialog, wherever the focus is.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        requestClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  function onClosed() {
    setOpen(false)
    reset()
    opener.current?.focus()
    // Opened from the board's link: drop ?email=1 so a reload doesn't open it again.
    const u = new URL(window.location.href)
    if (u.searchParams.has('email')) {
      u.searchParams.delete('email')
      window.history.replaceState(null, '', u)
    }
  }

  const here = ordered.filter((t) => t.stage === stage)
  const rest = ordered.filter((t) => t.stage !== stage)
  const keepCaret = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    caret.current = e.currentTarget.selectionStart
  }

  return (
    <>
      <button ref={opener} type="button" className={`btn btn-secondary${small ? ' btn-sm' : ''}`} aria-expanded={open} onClick={() => (open ? heading.current?.focus() : setOpen(true))}>{label}</button>
      <dialog ref={panel} className="em-panel" aria-labelledby={`${uid}-h`} onClose={onClosed}>
        {open && (
          <>
            <div className="em-panel-head">
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <span className="eyebrow">{step === 'done' ? 'Done' : step === 'confirm' ? 'Check and send' : 'Email · nothing is sent until you press Send'}</span>
                <h2 id={`${uid}-h`} ref={heading} tabIndex={-1} className="a-h2 a-h2-lg">{step === 'done' ? done : step === 'confirm' ? `Send to ${toLine}?` : 'Write an email'}</h2>
              </div>
              <button type="button" className="em-close" aria-label="Close the email" onClick={requestClose}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div className="em-panel-scroll">
              <p className="sr-only" role="status" aria-live="polite">{said}</p>

              {step === 'edit' && (
                <>
                  <div className="a-switch em-views" role="group" aria-label="Show">
                    <button type="button" aria-pressed={view === 'write'} onClick={() => setView('write')}>Write</button>
                    <button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Preview</button>
                  </div>

                  {view === 'preview' ? (
                    <PreviewFrame html={preview.html} bad={preview.bad} message={preview.message} title="Preview of the email" />
                  ) : (
                    <div className="stack em-form">
                      <div className="field">
                        <label htmlFor={`${uid}-to`}>To</label>
                        <input id={`${uid}-to`} className="input" type="text" inputMode="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} aria-describedby={`${uid}-to-h`} aria-invalid={Boolean(toError) || undefined} />
                        <span id={`${uid}-to-h`} className="hint">{toError ? <span className="err">{toError}</span> : 'Separate more than one address with commas.'}</span>
                      </div>
                      <div className="field">
                        <label htmlFor={`${uid}-t`}>Start from</label>
                        <select id={`${uid}-t`} className="input" value={pick} onChange={(e) => choose(e.target.value)}>
                          <option value="">{drafted ? 'Claude’s draft' : 'A blank email'}</option>
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

                      <DraftFromCall projectId={projectId} granola={granola} onDraft={fillDraft} />

                      {chosen && !chosen.approved && <Warning>{NOT_APPROVED}</Warning>}
                      {drafted && <Warning>Drafted by Claude — read it before sending.{drafted.warning ? ` ${drafted.warning}` : ''}</Warning>}

                      <div className="field">
                        <label htmlFor={`${uid}-s`}>Subject</label>
                        <input id={`${uid}-s`} className="input" value={subject} maxLength={LIMITS.subject} onChange={(e) => { setSubject(e.target.value); setDirty(true) }} />
                      </div>
                      <div className="field">
                        <label htmlFor={`${uid}-b`}>Email</label>
                        <textarea
                          id={`${uid}-b`}
                          ref={bodyRef}
                          className={`input em-body${dropping ? ' em-drop' : ''}`}
                          value={body}
                          maxLength={LIMITS.body}
                          spellCheck
                          onChange={(e) => {
                            const v = e.target.value
                            setBody(dropped.current ? tidyTokens(v) : v)
                            dropped.current = false
                            setDirty(true)
                          }}
                          onSelect={keepCaret}
                          onKeyUp={keepCaret}
                          onClick={keepCaret}
                          onDragEnter={() => setDropping(true)}
                          onDragLeave={() => setDropping(false)}
                          onDrop={() => {
                            dropped.current = true
                            setDropping(false)
                          }}
                          aria-describedby={`${uid}-b-h`}
                        />
                        <span id={`${uid}-b-h`} className="hint">A blank line starts a new paragraph. Web addresses become links. Portal blocks show here as [[block:…]] lines.</span>
                      </div>
                      {unfilled.length > 0 && <p className="small a-urgent" style={{ margin: 0 }}>Still has {unfilled.map((k) => `{${k}}`).join(', ')} in it, with nothing to fill it with. Replace it before sending.</p>}
                      {inline.length > 0 && <p className="small a-urgent" style={{ margin: 0 }}>Put {inline.join(', ')} on a line of its own.</p>}
                      {strange.length > 0 && <p className="small a-urgent" style={{ margin: 0 }}>{strange.join(', ')} isn’t one of this project’s portal blocks. Remove it, or the email won’t send.</p>}

                      <PortalBlocks blocks={blocks} inBody={inBody} onAdd={addBlock} onRemove={removeBlock} />
                    </div>
                  )}
                </>
              )}

              {step === 'confirm' && (
                <>
                  <dl className="key-dates">
                    <div><dt>To</dt><dd>{recipients.valid.join(', ')}</dd></div>
                    <div><dt>Subject</dt><dd>{subject}</dd></div>
                    {templateName && <div><dt>Template</dt><dd>{templateName}{chosen && !drafted && !chosen.approved ? ' · not approved' : ''}</dd></div>}
                  </dl>
                  {chosen && !drafted && !chosen.approved && <p className="small a-urgent" style={{ margin: 0 }}>{NOT_APPROVED}</p>}
                  {drafted && <p className="small a-urgent" style={{ margin: 0 }}>Drafted by Claude — make sure you’ve read every line.</p>}
                  {unfilled.length > 0 && <p className="small a-urgent" style={{ margin: 0 }}>It still has {unfilled.map((k) => `{${k}}`).join(', ')} in it.</p>}
                  <p className="small" style={{ margin: 0 }}>It goes out now from your address, with the Breaking Ice header and footer. Replies come to you.</p>
                  <PreviewFrame html={preview.html} bad={preview.bad} message={preview.message} title="Preview of the email" />
                </>
              )}

              {error && <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>}
            </div>

            <div className="btn-row em-panel-foot">
              {step === 'edit' && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={requestClose}>Cancel</button>
                  <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => { setError(''); setStep('confirm') }}>Check and send</button>
                </>
              )}
              {step === 'confirm' && (
                <>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStep('edit')}>Back</button>
                  <button type="button" className="btn btn-primary" disabled={busy || !ready || Boolean(preview.message)} onClick={send}>{busy ? 'Sending…' : `Send to ${toLine}`}</button>
                </>
              )}
              {step === 'done' && <button type="button" className="btn btn-primary" onClick={() => panel.current?.close()} autoFocus>Done</button>}
            </div>
          </>
        )}
      </dialog>
    </>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="a-warning">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.5" /></svg>
      <span>{children}</span>
    </p>
  )
}

/**
 * "Add from the portal": this project's blocks. Drag one into the email, or press Add (keyboard, touch).
 * Each goes in as a [[block:…]] line; the preview and the sent email show the real section.
 */
function PortalBlocks({ blocks, inBody, onAdd, onRemove }: { blocks: BlockOption[]; inBody: Set<string>; onAdd: (b: BlockOption) => void; onRemove: (b: BlockOption) => void }) {
  const uid = useId()
  return (
    <section className="stack em-blocks" aria-labelledby={`${uid}-h`}>
      <div className="stack" style={{ gap: 2 }}>
        <h3 id={`${uid}-h`} className="a-round-label" style={{ margin: 0 }}>Add from the portal</h3>
        <p className="muted small" style={{ margin: 0 }}>Drag one into the email, or press Add. It fills in from the project when it’s sent.</p>
      </div>
      {blocks.length ? (
        <ul className="em-block-list">
          {blocks.map((b) => {
            const used = inBody.has(b.token)
            return (
              <li
                key={b.token}
                draggable={!used}
                className={used ? 'used' : undefined}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', `\n\n${b.token}\n\n`)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
              >
                <span className="em-block-kind" aria-hidden="true">{BLOCK_KIND[b.kind]}</span>
                <span className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                  <span className="em-block-label">{b.label}</span>
                  {b.detail && <span className="muted small em-block-detail">{b.detail}</span>}
                </span>
                {used ? (
                  <button type="button" className="linklike small" onClick={() => onRemove(b)} aria-label={`Take ${b.label} out of the email`}>Remove</button>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAdd(b)} aria-label={`Add ${b.label} to the email`}>Add</button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted small a-empty">Nothing from the portal yet.</p>
      )}
    </section>
  )
}

type CallNote = { id: string; title: string; at: string; match?: 'attendee' | 'title' }
type DraftReply = { ok?: boolean; sample?: boolean; message?: string; notes?: CallNote[]; subject?: string; body?: string; warning?: string }
const call = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as DraftReply }))
    .catch(() => ({ ok: false, status: 0, data: { message: 'No connection. Try again.' } as DraftReply }))
const callDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' })

/**
 * "Draft from a call": Claude writes the first email after a call, from a Granola note or pasted
 * notes (Wispr Flow, an email, anything). It only fills the subject and email; nothing is sent.
 */
function DraftFromCall({ projectId, granola, onDraft }: { projectId: string; granola: boolean; onDraft: (d: { subject: string; body: string; warning?: string }) => boolean }) {
  const uid = useId()
  const [shown, setShown] = useState(false)
  const [from, setFrom] = useState<'granola' | 'paste'>(granola ? 'granola' : 'paste')
  const [notes, setNotes] = useState<CallNote[] | null>(null)
  const [noteErr, setNoteErr] = useState('')
  const [noteId, setNoteId] = useState('')
  const [text, setText] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!shown || from !== 'granola' || !granola || notes || noteErr) return
    let stale = false
    call('/api/admin/email/granola', { projectId }).then((r) => {
      if (stale) return
      if (!r.ok || !r.data.notes) return setNoteErr(failed(r.status, r.data.message))
      setNotes(r.data.notes)
      const top = r.data.notes.find((n) => n.match)
      if (top) setNoteId(top.id)
    })
    return () => {
      stale = true
    }
  }, [shown, from, granola, notes, noteErr, projectId])

  async function draft() {
    setBusy(true)
    setError('')
    setNote('')
    const r = await call('/api/admin/email/draft', { projectId, ...(from === 'granola' ? { noteId } : { text }), goal })
    setBusy(false)
    if (!r.ok || !r.data.subject || !r.data.body) return setError(failed(r.status, r.data.message))
    if (onDraft({ subject: r.data.subject, body: r.data.body, warning: r.data.warning })) setNote(r.data.sample ? 'Sample data: this is a made-up draft. Nothing was sent to Claude.' : 'Done. It’s in the subject and email below.')
  }

  const canDraft = !busy && (from === 'granola' ? Boolean(noteId) : text.trim().length > 20)

  return (
    <details className="em-draft" open={shown} onToggle={(e) => setShown(e.currentTarget.open)}>
      <summary>Draft from a call</summary>
      <div className="stack em-draft-body">
        <div className="a-switch" role="group" aria-label="Where the call notes come from">
          <button type="button" aria-pressed={from === 'granola'} onClick={() => setFrom('granola')}>Granola</button>
          <button type="button" aria-pressed={from === 'paste'} onClick={() => setFrom('paste')}>Paste notes</button>
        </div>

        {from === 'granola' ? (
          !granola ? (
            <p className="small a-urgent" style={{ margin: 0 }}>Connect Granola: add GRANOLA_API_KEY in Vercel. You can paste the notes instead.</p>
          ) : noteErr ? (
            <p className="small err" style={{ margin: 0 }}>{noteErr} You can paste the notes instead.</p>
          ) : !notes ? (
            <p className="muted small" style={{ margin: 0 }}>Looking for recent calls…</p>
          ) : !notes.length ? (
            <p className="muted small" style={{ margin: 0 }}>No Granola notes from the last 60 days. Paste the notes instead.</p>
          ) : (
            <fieldset className="em-calls">
              <legend className="small">Pick the call (last 60 days)</legend>
              {notes.map((n) => (
                <label key={n.id} className="em-call">
                  <input type="radio" name={`${uid}-call`} value={n.id} checked={noteId === n.id} onChange={() => setNoteId(n.id)} />
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <span>{n.title}</span>
                    <span className="muted small">{callDay(n.at)}{n.match === 'attendee' ? ' · they were on the invite' : n.match === 'title' ? ' · named in the title' : ''}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )
        ) : (
          <div className="field">
            <label htmlFor={`${uid}-paste`}>Paste notes or a transcript (Wispr Flow, email, anything)</label>
            <textarea id={`${uid}-paste`} className="input em-paste" value={text} maxLength={100_000} onChange={(e) => setText(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label htmlFor={`${uid}-goal`}>What should this email do? <span className="muted">(optional)</span></label>
          <input id={`${uid}-goal`} className="input" value={goal} maxLength={500} placeholder="Thank them, reflect what they want, propose the next step" onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div className="row-wrap">
          <button type="button" className="btn btn-secondary btn-sm" disabled={!canDraft} onClick={draft}>{busy ? 'Drafting… (up to a minute)' : 'Draft it'}</button>
          <span className="muted small">Claude writes it; you read it and send it.</span>
        </div>
        {error && <p className="err small" role="alert" style={{ margin: 0 }}>{error}</p>}
        {note && <p className="small" role="status" style={{ margin: 0 }}>{note}</p>}
      </div>
    </details>
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
