'use client'

import { Dancing_Script } from 'next/font/google'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { asked, ESIGN_CONSENT, paragraphs, segments, type DocField } from './sign-docs'
import './sign-doc.css'

const script = Dancing_Script({ subsets: ['latin'], weight: '500', display: 'swap' })

export type SignedView = { name: string; at: string; /** Formatted on the server, the same as on the PDF. */ atLabel: string; forMinor?: boolean; values: Record<string, string>; certificateId: string; via: 'link' | 'portal'; portalEmail?: string }

type Props = {
  token: string
  title: string
  body: string
  fields: DocField[]
  /** Owner-filled values, plus project and client. */
  values: Record<string, string>
  signed?: SignedView
  /** Why signing is switched off here (the owner looking, or viewing as the client). */
  locked?: string
  pdfHref?: string
  defaultName?: string
}

/** The document's text with its fill-ins marked. Signer fill-ins follow what's typed below. */
export function DocText({ body, fields, values, live, choicesInline }: { body: string; fields: DocField[]; values: Record<string, string>; live?: boolean; /** Previews: an unanswered choice shows its options in place, so the whole wording can be read. */ choicesInline?: boolean }) {
  return (
    <div className="sd-text">
      {paragraphs(body).map((p, i) => (
        <p key={i}>
          {segments(p, fields, values).map((s, j) =>
            'text' in s ? (
              <span key={j}>{s.text}</span>
            ) : s.value ? (
              <mark key={j} className={`sd-val sd-${s.who}`}>{s.value}</mark>
            ) : (
              <mark key={j} className="sd-val sd-empty">
                {emptyText(fields.find((f) => f.key === s.field), s, live, choicesInline)}
                <span className="sr-only"> ({s.label}, not filled in yet)</span>
              </mark>
            ),
          )}
        </p>
      ))}
    </div>
  )
}

function emptyText(f: DocField | undefined, s: { label: string; who: string }, live?: boolean, inline?: boolean) {
  if (f?.type === 'choice' && f.options?.length) return inline ? f.options.join(' / ') : 'your choice below'
  return live && s.who !== 'owner' ? s.label : '____________'
}

export function SignDoc({ token, title, body, fields, values, signed, locked, pdfHref, defaultName = '' }: Props) {
  const router = useRouter()
  const uid = useId()
  const [name, setName] = useState(defaultName)
  const [forMinor, setForMinor] = useState(false)
  const [mine, setMine] = useState<Record<string, string>>({})
  const [agree, setAgree] = useState(false)
  const [state, setState] = useState<{ busy?: boolean; err?: string; field?: string; demo?: boolean }>({})
  const hasMinor = fields.some((f) => f.minor)
  const askedFields = fields.filter((f) => asked(f, forMinor))
  const missing = askedFields.filter((f) => !f.optional && !mine[f.key]?.trim())
  const ready = name.trim().length >= 2 && agree && missing.length === 0

  const shown = signed
    ? { ...values, ...signed.values, signer_name: signed.name }
    : { ...values, ...Object.fromEntries(askedFields.map((f) => [f.key, mine[f.key] ?? ''])), signer_name: name.trim() }

  async function sign(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || state.busy || locked) return
    setState({ busy: true })
    const r = await fetch('/api/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name: name.trim(), values: Object.fromEntries(askedFields.map((f) => [f.key, mine[f.key] ?? ''])), forMinor, agree }),
    }).catch(() => null)
    const j = await r?.json().catch(() => null)
    if (r?.ok && j?.ok) {
      if (j.demo) return setState({ demo: true })
      setState({})
      router.refresh()
      return
    }
    const err =
      j?.error === 'already-signed' ? 'This document has already been signed. Reload the page to see it.'
      : j?.error === 'withdrawn' ? 'This document was withdrawn, so it can’t be signed.'
      : j?.error === 'preview' ? 'You’re viewing as the client, so signing is switched off.'
      : j?.error === 'signed-out' ? 'Your portal session ended. Sign in again, then sign.'
      : j?.error === 'too-many' ? 'Too many tries. Wait a little and try again.'
      : j?.error === 'invalid' ? 'Something is missing. Check each answer and your name, then sign.'
      : 'Something went wrong and nothing was signed. Try again, or reply to the email you got.'
    setState({ err, field: j?.field })
  }

  return (
    <div className="sd stack">
      <article className="sd-doc" aria-labelledby={`${uid}-t`}>
        <h2 id={`${uid}-t`} className="sd-title">{title}</h2>
        <DocText body={body} fields={fields} values={shown} live={!signed} />
      </article>

      {signed ? (
        <section className="sd-done" aria-labelledby={`${uid}-d`}>
          <p className="sd-badge" id={`${uid}-d`}><span aria-hidden="true">✓</span> Signed</p>
          <dl className="sd-record">
            <div><dt>Signed by</dt><dd className={script.className + ' sd-sig'}>{signed.name}</dd></div>
            <div><dt>Date and time</dt><dd>{signed.atLabel}</dd></div>
            {signed.forMinor && <div><dt>For</dt><dd>A minor{signed.values.minor_name ? `: ${signed.values.minor_name}` : ''}</dd></div>}
            {signed.via === 'portal' && signed.portalEmail && <div><dt>Signed in as</dt><dd>{signed.portalEmail}</dd></div>}
            <div><dt>Certificate</dt><dd>{signed.certificateId}</dd></div>
          </dl>
          {pdfHref && (
            <div className="btn-row">
              <a className="btn btn-primary" href={`${pdfHref}&download=1`}>Download PDF</a>
              <a className="text-link small" href={pdfHref} target="_blank" rel="noopener noreferrer">Open it<span className="sr-only"> (opens the signed PDF in a new tab)</span></a>
            </div>
          )}
          <p className="muted small" style={{ margin: 0 }}>This document is signed and can’t be changed. The PDF ends with a certificate page recording the name, time and device.</p>
        </section>
      ) : state.demo ? (
        <p className="sd-note" role="status">Sample only: nothing was signed or sent.</p>
      ) : (
        <form className="sd-form stack" onSubmit={sign} aria-labelledby={`${uid}-s`} noValidate>
          <h2 id={`${uid}-s`} className="sd-h">Fill in and sign</h2>
          {locked && <p className="sd-note" role="note">{locked}</p>}

          {hasMinor && (
            <label className="q-agree">
              <input type="checkbox" checked={forMinor} onChange={(e) => setForMinor(e.target.checked)} disabled={Boolean(locked)} />
              <span>I’m signing for a minor, as their parent or legal guardian</span>
            </label>
          )}

          {askedFields.map((f) => {
            const id = `${uid}-${f.key}`
            const bad = state.field === f.key
            const label = <>{f.label}{f.optional && <span className="muted small"> (optional)</span>}</>
            if (f.type === 'choice')
              return (
                <fieldset key={f.key} className="sd-choice" aria-invalid={bad || undefined}>
                  <legend>{label}</legend>
                  {f.options?.map((o, i) => (
                    <label key={i} className={`sd-radio${mine[f.key] === o ? ' on' : ''}`}>
                      <input type="radio" name={id} value={o} checked={mine[f.key] === o} onChange={() => setMine({ ...mine, [f.key]: o })} required={!f.optional} disabled={Boolean(locked)} />
                      <span>{o}</span>
                    </label>
                  ))}
                </fieldset>
              )
            return (
              <div key={f.key} className="field">
                <label htmlFor={id}>{label}</label>
                <input
                  id={id}
                  className="input"
                  type={f.type === 'date' ? 'date' : 'text'}
                  inputMode={f.type === 'money' ? 'decimal' : undefined}
                  value={mine[f.key] ?? ''}
                  onChange={(e) => setMine({ ...mine, [f.key]: e.target.value })}
                  maxLength={f.type === 'text' ? 300 : 40}
                  required={!f.optional}
                  aria-invalid={bad || undefined}
                  disabled={Boolean(locked)}
                />
              </div>
            )
          })}

          <div className="field">
            <label htmlFor={`${uid}-name`}>Your full name</label>
            <input id={`${uid}-name`} className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} disabled={Boolean(locked)} aria-describedby={`${uid}-name-h`} />
            <span id={`${uid}-name-h`} className="hint">Typing your name is your signature.</span>
          </div>
          <div className={`sd-sigbox ${script.className}`} aria-hidden="true">{name.trim() || 'Your name'}</div>

          <label className="q-agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required disabled={Boolean(locked)} />
            <span>{ESIGN_CONSENT}</span>
          </label>

          {state.err && <p className="err small" role="alert" style={{ margin: 0 }}>{state.err}</p>}
          <div>
            <button type="submit" className="btn btn-primary" disabled={!ready || state.busy || Boolean(locked)}>{state.busy ? 'Signing…' : 'Sign'}</button>
          </div>
          {!locked && missing.length > 0 && name.trim().length >= 2 && (
            <p className="muted small" style={{ margin: 0 }}>Still to answer: {missing.map((f) => f.label).join(', ')}.</p>
          )}
          <p className="muted small" style={{ margin: 0 }}>After signing you can download the signed PDF. It records your name, the time and this device.</p>
        </form>
      )}
    </div>
  )
}
