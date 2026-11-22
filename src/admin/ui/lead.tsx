'use client'

import { useRouter } from 'next/navigation'
import { activityText } from '../activity-text'
import { useEffect, useId, useRef, useState } from 'react'
import { PROJECT_TYPES } from '@/sanity/portal/office-constants'
import { CONTACT_KINDS, LEAD_BUDGETS, LEAD_SOURCES, LOST_REASONS, webHref } from '../lead'
import type { LeadDetails } from '../types'
import { useNotify } from './confirm'
import { StageDialog, type Stage } from './stage-dialog'
import { TagChips } from './tag-chips'

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as { sample?: boolean; message?: string; id?: string } }))
    .catch(() => ({ ok: false, status: 0, data: {} as { sample?: boolean; message?: string; id?: string } }))

const failed = (status: number) => (status === 401 ? 'This sign-in can’t change things, or it has expired.' : 'That didn’t save. Reload the page and try again.')
const SAMPLE = 'Sample data: nothing was saved.'

/* ── The four-step strip ─────────────────────────────────────────────── */

/**
 * New lead, Call booked, Quote, Signed. Clicking a step opens the usual stage preview for it.
 * Quote covers two stages: "Quote to write", or "Quoted" once a quote has gone out.
 */
export function LeadSteps({ projectId, projectTitle, stage, quoteSent }: { projectId: string; projectTitle: string; stage: string; quoteSent: boolean }) {
  const [target, setTarget] = useState<Stage | null>(null)
  const steps: (Stage & { name: string })[] = [
    { name: 'New lead', title: 'New lead', value: 'lead' },
    { name: 'Call booked', title: 'Call booked', value: 'call' },
    quoteSent || stage === 'quoted' ? { name: 'Quote', title: 'Quoted', value: 'quoted' } : { name: 'Quote', title: 'Quote to write', value: 'proposal' },
    { name: 'Signed', title: 'Onboarding', value: 'booked' },
  ]
  const at = stage === 'lead' ? 0 : stage === 'call' ? 1 : 2
  return (
    <>
      <ol className="ld-steps" aria-label={`Stage: ${steps[at].name}`}>
        {steps.map((s, i) => {
          const here = s.value === stage
          return (
            <li key={s.name} className={i < at ? 'done' : i === at ? 'current' : ''} aria-current={i === at ? 'step' : undefined}>
              <button type="button" disabled={here} onClick={() => setTarget({ title: s.title, value: s.value })}>
                <span className="dot" aria-hidden="true" />
                <span className="name">{s.name}</span>
                <span className="sr-only">{here ? ' (they are here)' : i <= at ? ' (reached). Move them here' : '. Move them here'}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <StageDialog projectId={projectId} projectTitle={projectTitle} target={target} onClose={() => setTarget(null)} />
    </>
  )
}

/* ── Details that save when you leave the field ──────────────────────── */

type Patch = Partial<Record<keyof LeadDetails | 'projectType', string>>
/** Resolves true when it saved, 'sample' when sample data took it without keeping it, false when it failed. */
type Saver = (patch: Patch) => Promise<boolean | 'sample'>

/** A small "Saved" tick beside a field for a moment after it saves (the status line says it too, for screen readers). */
function useSavedTick() {
  const [on, setOn] = useState(false)
  // The word stays put while it fades out.
  const [kind, setKind] = useState<'saved' | 'sample'>('saved')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = (r: boolean | 'sample') => {
    if (!r) return
    setKind(r === true ? 'saved' : 'sample')
    setOn(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOn(false), 1800)
  }
  const el = <span className={`ld-saved${on ? ' on' : ''}`} aria-hidden="true">{kind === 'sample' ? 'Not kept' : 'Saved'}</span>
  return [show, el] as const
}

function TextField({ label, name, value, save, type = 'text', after, placeholder }: { label: string; name: keyof Patch; value?: string; save: Saver; type?: string; after?: (v: string) => React.ReactNode; placeholder?: string }) {
  const id = useId()
  const saved = useRef(value ?? '')
  const [v, setV] = useState(value ?? '')
  const [tick, tickEl] = useSavedTick()
  const blur = () => {
    const next = v.trim()
    if (next === saved.current) return
    // Remembered only once it saved, so leaving the field again after a failure retries.
    void save({ [name]: next }).then((ok) => { if (ok) saved.current = next; tick(ok) })
  }
  return (
    <div className="ld-row">
      <label htmlFor={id}>{label}</label>
      <span className="ld-control">
        <span className="ld-field">
          <input id={id} className="ld-in" type={type} value={v} placeholder={placeholder ?? 'Add'} onChange={(e) => setV(e.target.value)} onBlur={blur} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
          {tickEl}
        </span>
        {after?.(v)}
      </span>
    </div>
  )
}

function SelectField({ label, name, value, save, options, none }: { label: string; name: keyof Patch; value?: string; save: Saver; options: { title: string; value: string }[]; none: string }) {
  const id = useId()
  const [v, setV] = useState(value ?? '')
  const [tick, tickEl] = useSavedTick()
  return (
    <div className="ld-row">
      <label htmlFor={id}>{label}</label>
      <span className="ld-control">
        <span className="ld-field ld-field-select">
          <select id={id} className="ld-in" value={v} onChange={(e) => { setV(e.target.value); void save({ [name]: e.target.value }).then(tick) }}>
            <option value="">{none}</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.title}</option>)}
          </select>
          {tickEl}
        </span>
      </span>
    </div>
  )
}

const Fixed = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="ld-row">
    <span className="ld-label">{label}</span>
    <span className="ld-control ld-fixed">{children}</span>
  </div>
)

export type LeadContact = {
  name?: string
  email?: string
  company: string
  /** True when the name and email come from the client's contact list, which is edited in the Studio. */
  onClient: boolean
  studioHref?: string
  /** Their tags from the people list (/admin/contacts), shown read-only. */
  tags?: string[]
}

export function LeadFields({ projectId, contact, lead, projectType }: { projectId: string; contact: LeadContact; lead: LeadDetails; projectType?: string }) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const notesSaved = useRef(lead.notes ?? '')
  const [notes, setNotes] = useState(lead.notes ?? '')

  const save: Saver = async (patch) => {
    setStatus('Saving…')
    const r = await post('/api/admin/lead', { projectId, patch })
    setStatus(r.ok ? (r.data.sample ? SAMPLE : 'Saved.') : failed(r.status))
    // The heading and "Next up" read these details too.
    if (r.ok && !r.data.sample) router.refresh()
    return r.ok ? (r.data.sample ? 'sample' : true) : false
  }

  return (
    <div className="stack gap-4">
      <div className="ld-cols">
        <section className="p-card" aria-labelledby="ld-h-contact">
          <div className="a-card-head">
            <h2 id="ld-h-contact" className="a-h2">Contact</h2>
            {contact.onClient && contact.studioHref && (
              <a className="text-link small" href={contact.studioHref} target="_blank" rel="noopener noreferrer">Edit client details<span aria-hidden="true"> ↗</span><span className="sr-only"> in the editor (opens in a new tab)</span></a>
            )}
          </div>
          <div className="ld-rows">
            {contact.onClient ? (
              <>
                <Fixed label="Name">{contact.name || '—'}</Fixed>
                <Fixed label="Email">{contact.email ? <a className="text-link-plain" href={`mailto:${contact.email}`}>{contact.email}</a> : '—'}</Fixed>
              </>
            ) : (
              <>
                <TextField label="Name" name="name" value={contact.name} save={save} />
                <TextField label="Email" name="email" type="email" value={contact.email} save={save} />
              </>
            )}
            <TextField label="Phone" name="phone" type="tel" value={lead.phone} save={save} />
            <Fixed label="Company">{contact.company}</Fixed>
            {contact.tags?.length ? <Fixed label="Tags"><TagChips tags={contact.tags} /></Fixed> : null}
            <TextField
              label="Website"
              name="website"
              value={lead.website}
              save={save}
              after={(v) => webHref(v) && <a className="text-link small" href={webHref(v)} target="_blank" rel="noopener noreferrer">Open<span className="sr-only"> their website in a new tab</span></a>}
            />
            <SelectField label="Found us" name="source" value={lead.source} save={save} options={LEAD_SOURCES} none="Not asked yet" />
          </div>
          {!contact.onClient && (
            <p className="muted small m0">Not on {contact.company}’s contact list, so they can’t sign in to the portal or get its emails. Add them to the contact list in the editor when they should.</p>
          )}
        </section>

        <section className="p-card" aria-labelledby="ld-h-project">
          <h2 id="ld-h-project" className="a-h2">The project</h2>
          <div className="ld-rows">
            <SelectField label="Type" name="projectType" value={projectType} save={save} options={PROJECT_TYPES} none="Not set" />
            <SelectField label="Budget" name="budget" value={lead.budget} save={save} options={LEAD_BUDGETS} none="Not discussed" />
            <TextField label="Start date" name="startDate" type="date" value={lead.startDate} save={save} />
            <TextField label="Call date" name="callDate" type="date" value={lead.callDate} save={save} />
            <TextField label="Call time" name="callTime" type="time" value={lead.callTime} save={save} />
          </div>
        </section>
      </div>

      <section className="p-card" aria-label="Notes">
        <label htmlFor="ld-notes" className="a-h2">Why now, and your notes</label>
        <textarea
          id="ld-notes"
          className="input ld-notes"
          rows={5}
          value={notes}
          placeholder="What’s driving this, in their words. Anything you want to remember for the call or the quote."
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            const next = notes.trim()
            if (next === notesSaved.current) return
            void save({ notes: next }).then((ok) => { if (ok) notesSaved.current = next })
          }}
        />
      </section>

      <p className="muted small ld-hint">
        <span>Change any detail; it saves when you leave the field.</span>
        <span role="status">{status}</span>
      </p>
    </div>
  )
}

/* ── Log contact, and the activity list ──────────────────────────────── */

/** `source` (where the line came from) and `note` (one of your own notes) are for the project page, which lists more than the log. */
export type LeadLogEntry = { key: string; date: string; time?: string; text: string; source?: string; note?: boolean }

export function LeadActivity({ projectId, today, entries }: { projectId: string; today: string; entries: LeadLogEntry[] }) {
  const router = useRouter()
  const [kind, setKind] = useState(CONTACT_KINDS[0].value)
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [all, setAll] = useState(false)
  const shown = all ? entries : entries.slice(0, 5)
  const earlier = entries.length - 5

  async function log(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const r = await post('/api/admin/lead', { projectId, contact: { kind, date, note } })
    setBusy(false)
    if (!r.ok) return setMsg(r.status === 400 ? 'Pick today or an earlier date.' : failed(r.status))
    setNote('')
    setMsg(r.data.sample ? SAMPLE : 'Logged.')
    router.refresh()
  }

  return (
    <section className="p-card" aria-labelledby="ld-h-activity">
      <h2 id="ld-h-activity" className="a-h2">Activity</h2>
      <form onSubmit={log} className="ld-log" aria-label="Log contact">
        <span className="a-round-label">Log contact</span>
        <div className="ld-log-row">
          <label><span className="sr-only">Kind of contact</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {CONTACT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.title}</option>)}
            </select>
          </label>
          <label><span className="sr-only">Date</span>
            <input className="input" type="date" value={date} max={today} required onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label><span className="sr-only">Short note</span>
          <input className="input" value={note} maxLength={200} placeholder="Short note (optional)" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="row-wrap">
          <button type="submit" className="btn btn-secondary btn-sm" disabled={busy}>{busy ? 'Logging…' : 'Log it'}</button>
          <span className="small muted" role="status">{msg}</span>
        </div>
      </form>

      {entries.length ? (
        <ul className="a-feed ld-feed">
          {shown.map((l) => (
            <li key={l.key}>
              <span className={l.source ? 'stack' : undefined}>
                <span className={l.note ? 'a-note' : undefined}>{l.note ? l.text : activityText(l.text)}</span>
                {l.source && <span className="muted small">{l.source}</span>}
              </span>
              <span className="muted small ld-when">{l.date}{l.time && <><br />{l.time}</>}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small a-empty">Nothing logged yet.</p>
      )}
      {earlier > 0 && (
        <button type="button" className="linklike small ld-more" aria-expanded={all} onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show ${earlier} earlier`}</button>
      )}
    </section>
  )
}

/* ── Archive, with a reason ──────────────────────────────────────────── */

export function LeadArchive({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter()
  const menu = useRef<HTMLDetailsElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState<(typeof LOST_REASONS)[number] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const notify = useNotify()

  useEffect(() => {
    const d = dialog.current
    if (reason && d && !d.open) d.showModal()
  }, [reason])

  // The menu closes on a click outside it or on Escape.
  useEffect(() => {
    const close = (e: Event) => {
      const m = menu.current
      if (!m?.open) return
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !m.contains(e.target as Node)) m.open = false
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  async function archive() {
    if (!reason) return
    setBusy(true)
    setError('')
    const noted = await post('/api/admin/lead', { projectId, patch: { lostReason: reason.value } })
    const r = noted.ok ? await post('/api/admin/archive', { projectId, ...(reason.declined ? { declined: true } : { archived: true }) }) : noted
    setBusy(false)
    if (!r.ok) return setError(failed(r.status))
    dialog.current?.close()
    if (r.data.sample) return notify(SAMPLE)
    router.push('/admin/pipeline')
    router.refresh()
  }

  return (
    <>
      <details className="ld-menu" ref={menu}>
        <summary className="btn btn-secondary btn-sm">Archive</summary>
        <ul aria-label="Why it’s being archived">
          {LOST_REASONS.map((r) => (
            <li key={r.value}>
              <button type="button" onClick={() => { if (menu.current) menu.current.open = false; setReason(r) }}>{r.title}</button>
            </li>
          ))}
        </ul>
      </details>

      <dialog ref={dialog} className="a-dialog" aria-labelledby="ld-archive-h" onClose={(e) => { if (e.target !== e.currentTarget) return; setReason(null); setError('') }}>
        {reason && (
          <div className="a-dialog-body">
            <span className="eyebrow">Archive · {reason.title}</span>
            <h2 id="ld-archive-h" className="a-h2 a-h2-lg">Archive {name}?</h2>
            <p className="small m0">
              They leave the board and stop counting in your pipeline and reminders. Nothing is sent to them, and you can bring them back from the Archive bar on the Pipeline.
              {reason.declined && ' This one counts as declined in your win rate.'}
            </p>
            {error && <p className="err" role="alert">{error}</p>}
            <div className="btn-row a-dialog-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={archive}>{busy ? 'Archiving…' : 'Archive'}</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}

/* ── New lead form ───────────────────────────────────────────────────── */

export function LeadForm() {
  const router = useRouter()
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', title: '', projectType: '', budget: '', source: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean; field?: 'email' } | null>(null)
  const msgRef = useRef<HTMLParagraphElement>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const defaultTitle = `${f.company.trim() || f.name.trim() || 'Company'} project`
  const badEmail = { text: 'That email doesn’t look right. Check it and try again.', bad: true, field: 'email' as const }

  // An error is announced and focused, so it's never missed below the fold.
  useEffect(() => { if (msg?.bad) msgRef.current?.focus() }, [msg])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Email can be left empty, but one that's there has to look like an address (the same check the server makes).
    const email = f.email.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg(badEmail)
    setBusy(true)
    setMsg(null)
    const r = await post('/api/admin/lead/new', f)
    if (r.ok && r.data.id) return router.push(`/admin/leads/${encodeURIComponent(r.data.id)}`)
    setBusy(false)
    setMsg(r.ok ? { text: SAMPLE } : { text: r.data.message || failed(r.status), bad: true })
  }

  return (
    <form onSubmit={submit} className="p-card ld-form">
      <div className="ld-form-grid">
        <div className="field"><label htmlFor="nl-name">Name</label><input id="nl-name" className="input" required maxLength={120} autoComplete="off" value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="nl-email">Email <span className="muted">(optional)</span></label><input id="nl-email" className="input" type="email" maxLength={200} autoComplete="off" value={f.email} onChange={set('email')}
          // A malformed address gets the message below instead of the browser's bubble.
          onInvalid={(e) => { if (e.currentTarget.validity.typeMismatch) { e.preventDefault(); setMsg(badEmail) } }}
          aria-invalid={msg?.bad && msg.field === 'email' ? true : undefined} aria-describedby={msg?.bad && msg.field === 'email' ? 'nl-msg' : undefined} /></div>
        <div className="field"><label htmlFor="nl-phone">Phone <span className="muted">(optional)</span></label><input id="nl-phone" className="input" type="tel" maxLength={40} autoComplete="off" value={f.phone} onChange={set('phone')} /></div>
        <div className="field"><label htmlFor="nl-company">Company</label><input id="nl-company" className="input" required maxLength={160} autoComplete="off" value={f.company} onChange={set('company')} /></div>
        <div className="field ld-form-wide"><label htmlFor="nl-title">Project title</label><input id="nl-title" className="input" maxLength={160} placeholder={defaultTitle} value={f.title} onChange={set('title')} aria-describedby="nl-title-hint" /><span id="nl-title-hint" className="hint">Leave empty to call it “{defaultTitle}”.</span></div>
        <div className="field"><label htmlFor="nl-type">Type</label>
          <select id="nl-type" className="input" value={f.projectType} onChange={set('projectType')}><option value="">Not set</option>{PROJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.title}</option>)}</select>
        </div>
        <div className="field"><label htmlFor="nl-budget">Budget range</label>
          <select id="nl-budget" className="input" value={f.budget} onChange={set('budget')}><option value="">Not discussed</option>{LEAD_BUDGETS.map((b) => <option key={b.value} value={b.value}>{b.title}</option>)}</select>
        </div>
        <div className="field"><label htmlFor="nl-source">Found us</label>
          <select id="nl-source" className="input" value={f.source} onChange={set('source')}><option value="">Not asked yet</option>{LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.title}</option>)}</select>
        </div>
        <div className="field ld-form-wide"><label htmlFor="nl-notes">Notes</label><textarea id="nl-notes" className="input ld-notes" rows={4} maxLength={6000} value={f.notes} onChange={set('notes')} /></div>
      </div>
      <p className="muted small m0">Adding a lead sends them nothing. A company you already have is matched by its name or by this email; otherwise a new client is made with this one contact.</p>
      {msg && <p id="nl-msg" ref={msgRef} tabIndex={-1} className={`m0 ${msg.bad ? 'err' : 'small'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add lead'}</button>
        <a className="btn btn-secondary" href="/admin/pipeline">Cancel</a>
      </div>
    </form>
  )
}
