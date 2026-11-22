'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { DocText } from '@/portal/sign-doc'
import { detectFields, EMPTY_LINE, hasWording, newKey, sendable, SYSTEM_FIELDS, undefinedFields, type Audience, type DocField, type DocTemplate, type FieldType } from '@/portal/sign-docs'
import { SendDocumentToggle, type SendProject, type SendTemplate } from './sign-requests'
import { fmtDate } from '@/admin/dates'
import { StateDot } from './viz-d'

const TYPE_LABEL: Record<FieldType, string> = { text: 'Text', date: 'Date', money: 'Money', choice: 'Choice' }
const day = (iso: string) => fmtDate(iso)

const save = (body: unknown) =>
  fetch('/api/admin/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
    .catch(() => ({ ok: false, message: 'No connection. Try again.' }))

/** Owner fields show their default (or a blank); signer fields stay blank in a preview. */
const previewValues = (fields: DocField[]) => Object.fromEntries(fields.filter((f) => f.who === 'owner' && f.default).map((f) => [f.key, f.default!]))

/** Grey dot: no wording yet (can't be sent). Amber: needs your check. Green: wording approved. */
export function WordingChip({ t }: { t: DocTemplate }) {
  if (!hasWording(t)) return <StateDot tone="off" label="No wording yet, so it can’t be sent">No wording</StateDot>
  return t.wordingApproved ? <StateDot tone="on" label="Wording approved">Approved</StateDot> : <StateDot tone="warn" label="Needs your check">Check</StateDot>
}

/** One template: read it with its fill-ins marked, edit it, approve it, print a blank copy, send it. */
export function TemplatePanel({ template, projects, readOnly, sample }: { template: DocTemplate; projects: SendProject[]; readOnly?: boolean; sample?: boolean }) {
  const router = useRouter()
  const [t, setT] = useState(template)
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState<{ text: string; err?: boolean }>()
  const [busy, setBusy] = useState(false)
  const uid = useId()

  async function approve(on: boolean) {
    setBusy(true)
    const j = await save({ action: on ? 'approve' : 'unapprove', id: t._id })
    setBusy(false)
    if (!j.ok) return setMsg({ text: j.message ?? 'That didn’t work. Try again.', err: true })
    setT(j.template)
    setMsg({ text: on ? `Wording approved. ${t.title} can be sent now.${sample ? ' (Sample data: kept only until the app restarts.)' : ''}` : 'Back to Needs your check. It can’t be sent until you approve it again.' })
    router.refresh()
  }

  if (editing)
    return (
      <TemplateEditor
        template={t}
        onCancel={() => setEditing(false)}
        onSaved={(next, changed) => {
          setT(next)
          setEditing(false)
          setMsg({ text: changed && hasWording(next) ? 'Saved. The wording changed, so it needs your check before it can be sent.' : `Saved.${sample ? ' (Sample data: kept only until the app restarts.)' : ''}` })
          router.refresh()
        }}
      />
    )

  const sendT: SendTemplate = { id: t._id, title: t.title, audience: t.audience, body: t.body, fields: t.fields, projectOptional: t.kind === 'nda' }
  const notSetUp = undefinedFields(t.body, t.fields)
  return (
    <section className="p-card lb-panel" aria-labelledby={`${uid}-h`}>
      <div className="a-card-head">
        <h2 id={`${uid}-h`} className="a-h2 a-h2-lg">{t.title}</h2>
        <WordingChip t={t} />
      </div>
      <p className="sa-chips m0">
        <span className="sa-chip" title={t.audience === 'client' ? 'Signed in the client portal by the client’s contacts.' : 'Signed by one person through their own private link. Never shown in a client portal.'}>
          {t.audience === 'client' ? 'Client portal' : 'Own link'}
          <span className="sr-only">: {t.audience === 'client' ? 'signed in the client portal by the client’s contacts' : 'signed by one person through their own private link, never shown in a client portal'}</span>
        </span>
        <span className="sa-chip">Changed {day(t.updatedAt)}</span>
      </p>

      {hasWording(t) ? (
        <div className="lb-doc">
          <DocText body={t.body} fields={t.fields} values={previewValues(t.fields)} live choicesInline />
        </div>
      ) : (
        <p className="lb-empty-body sd-empty-body">No wording yet</p>
      )}

      {t.fields.length > 0 && (
        <div className="stack gap-2">
          <span className="a-round-label">Fill-ins</span>
          <ul className="lb-fields">
            {t.fields.map((f) => (
              <li key={f._key}>
                <code>{`{{${f.key}}}`}</code>
                <span>{f.label}</span>
                <span className="muted small">{TYPE_LABEL[f.type]} · {f.who === 'owner' ? 'you, before sending' : `signer${f.minor ? ', only for a minor' : ''}${f.optional ? ', optional' : ''}`}{f.default ? ` · starts as “${f.default}”` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notSetUp.length > 0 && <p className="small a-urgent m0">Not set up yet: {notSetUp.map((k) => `{{${k}}}`).join(', ')}. Add them under Edit, or it can’t be sent.</p>}

      {msg && <p className={`small ${msg.err ? 'err' : ''} m0`} role="status">{msg.text}</p>}
      <div className="row-wrap">
        {!readOnly && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setMsg(undefined); setEditing(true) }}>Edit</button>}
        {!readOnly && hasWording(t) && !t.wordingApproved && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => approve(true)}>Approve wording</button>}
        {!readOnly && t.wordingApproved && <button type="button" className="linklike small" disabled={busy} onClick={() => approve(false)}>Undo approval</button>}
        {hasWording(t) ? (
          <a className="btn btn-secondary btn-sm" href={`/api/admin/library/pdf?template=${encodeURIComponent(t._id)}&download=1`}>Download blank PDF</a>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled title="Needs wording first">Download blank PDF</button>
        )}
      </div>
      {!hasWording(t) ? null : !t.wordingApproved ? (
        <p className="muted small m0">Can’t be sent until you read it and press Approve wording.</p>
      ) : null}
      {!readOnly && sendable(t) && (
        <div className="pj-sub">
          <SendDocumentToggle templates={[sendT]} projects={projects} templateId={t._id} label="Send this document" />
        </div>
      )}
    </section>
  )
}

/** Plain textarea editor: the wording, the fill-ins list, the {{fields}} it finds, and a live preview. */
function TemplateEditor({ template, onCancel, onSaved }: { template: DocTemplate; onCancel: () => void; onSaved: (t: DocTemplate, changed: boolean) => void }) {
  const uid = useId()
  const [title, setTitle] = useState(template.title)
  const [audience, setAudience] = useState<Audience>(template.audience)
  const [body, setBody] = useState(template.body)
  const [fields, setFields] = useState<DocField[]>(template.fields)
  const [state, setState] = useState<{ busy?: boolean; err?: string }>({})

  const found = detectFields(body)
  const set = (k: string, patch: Partial<DocField>) => setFields(fields.map((f) => (f._key === k ? { ...f, ...patch } : f)))
  const add = (key = '') => setFields([...fields, { _key: newKey(), key, label: key ? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '', type: 'text', who: 'owner' }])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState({ busy: true })
    const j = await save({ action: 'save', id: template._id, title, audience, body, fields })
    if (!j.ok) return setState({ err: j.message ?? 'That didn’t save. Try again.' })
    onSaved(j.template, template.body !== body || JSON.stringify(template.fields) !== JSON.stringify(j.template.fields))
  }

  return (
    <form className="p-card lb-panel stack" onSubmit={submit} aria-labelledby={`${uid}-h`}>
      <div className="a-card-head">
        <h2 id={`${uid}-h`} className="a-h2 a-h2-lg">Edit: {template.title}</h2>
      </div>
      <div className="lb-two">
        <div className="field">
          <label htmlFor={`${uid}-title`}>Title</label>
          <input id={`${uid}-title`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-aud`}>Who signs it</label>
          <select id={`${uid}-aud`} className="input" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
            <option value="client">The client, in their portal</option>
            <option value="person">One person, through their own link</option>
          </select>
        </div>
      </div>

      <div className="lb-editor">
        <div className="field">
          <label htmlFor={`${uid}-body`}>Wording</label>
          <textarea id={`${uid}-body`} className="input lb-textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder={EMPTY_LINE} spellCheck aria-describedby={`${uid}-body-h`} />
          <span id={`${uid}-body-h`} className="hint">Paste your own wording. A blank line starts a new paragraph. Put a fill-in where it goes, like {'{{event}}'}. {'{{signer_name}}'}, {'{{project}}'} and {'{{client}}'} fill in by themselves.</span>
        </div>
        <div className="stack lb-live" aria-label="Live preview">
          <span className="a-round-label">Live preview</span>
          <div className="lb-doc">{body.trim() ? <DocText body={body} fields={fields} values={previewValues(fields)} live choicesInline /> : <p className="lb-empty-body">{EMPTY_LINE}</p>}</div>
        </div>
      </div>

      <div className="stack gap-2">
        <span className="a-round-label">Fields found in the wording</span>
        {found.length ? (
          <ul className="lb-found">
            {found.map((k) => {
              const ok = SYSTEM_FIELDS[k] ? 'automatic' : fields.some((f) => f.key === k) ? 'set up' : null
              return (
                <li key={k}>
                  <code>{`{{${k}}}`}</code>
                  {ok ? <span className="muted small">{ok === 'automatic' ? `Fills in by itself (${SYSTEM_FIELDS[k]})` : 'Set up below'}</span> : (
                    <button type="button" className="linklike small" onClick={() => add(k)}>Not set up: add it<span className="sr-only"> ({k})</span></button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted small a-empty">No {'{{fields}}'} in the wording yet.</p>
        )}
      </div>

      <fieldset className="lb-fs">
        <legend>Fill-ins</legend>
        {fields.length === 0 && <p className="muted small a-empty">None yet.</p>}
        {fields.map((f, i) => (
          <div key={f._key} className="lb-field-row" role="group" aria-label={`Fill-in ${i + 1}${f.key ? `: ${f.key}` : ''}`}>
            <div className="field">
              <label htmlFor={`${uid}-k-${f._key}`}>Name in the wording</label>
              <input id={`${uid}-k-${f._key}`} className="input" value={f.key} onChange={(e) => set(f._key, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} maxLength={40} required />
            </div>
            <div className="field">
              <label htmlFor={`${uid}-l-${f._key}`}>Label</label>
              <input id={`${uid}-l-${f._key}`} className="input" value={f.label} onChange={(e) => set(f._key, { label: e.target.value })} maxLength={100} />
            </div>
            <div className="field">
              <label htmlFor={`${uid}-ty-${f._key}`}>Type</label>
              <select id={`${uid}-ty-${f._key}`} className="input" value={f.type} onChange={(e) => set(f._key, { type: e.target.value as FieldType })}>
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${uid}-w-${f._key}`}>Filled in by</label>
              <select id={`${uid}-w-${f._key}`} className="input" value={f.who} onChange={(e) => set(f._key, { who: e.target.value as DocField['who'] })}>
                <option value="owner">You, before sending</option>
                <option value="signer">The signer</option>
              </select>
            </div>
            {f.type === 'choice' && (
              <div className="field lb-wide">
                <label htmlFor={`${uid}-o-${f._key}`}>Options, one per line</label>
                <textarea id={`${uid}-o-${f._key}`} className="input" rows={3} value={(f.options ?? []).join('\n')} onChange={(e) => set(f._key, { options: e.target.value.split('\n') })} />
              </div>
            )}
            {f.who === 'owner' && f.type !== 'choice' && (
              <div className="field">
                <label htmlFor={`${uid}-d-${f._key}`}>Starts as <span className="muted small">(optional)</span></label>
                <input id={`${uid}-d-${f._key}`} className="input" value={f.default ?? ''} onChange={(e) => set(f._key, { default: e.target.value || undefined })} maxLength={300} />
              </div>
            )}
            {f.who === 'signer' && (
              <div className="row-wrap lb-wide">
                <label className="lb-check"><input type="checkbox" checked={Boolean(f.minor)} onChange={(e) => set(f._key, { minor: e.target.checked || undefined })} /> Only when signing for a minor</label>
                <label className="lb-check"><input type="checkbox" checked={Boolean(f.optional)} onChange={(e) => set(f._key, { optional: e.target.checked || undefined })} /> Optional</label>
              </div>
            )}
            <div className="lb-wide">
              <button type="button" className="linklike small" onClick={() => setFields(fields.filter((x) => x._key !== f._key))}>Remove<span className="sr-only"> fill-in {f.key}</span></button>
            </div>
          </div>
        ))}
        <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => add()}>Add a fill-in</button></div>
      </fieldset>

      <p className="muted small m0">Saving a change to the wording or fill-ins sets it back to Needs your check. Documents already sent keep the text they were sent with.</p>
      {state.err && <p className="err small m0" role="alert">{state.err}</p>}
      <div className="row-wrap">
        <button type="submit" className="btn btn-primary btn-sm" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
