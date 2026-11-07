'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { OfficeQuote } from '@/admin/types'
import { coverImage } from '@/portal/pdf-view'

type Props = {
  projectId: string
  quote?: OfficeQuote
  total?: number
  deposit?: number
  /** Who the quote email goes to. */
  recipients: string[]
  /** The client's view, once there's a portal address. */
  previewHref?: string
}

const day = (iso?: string) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: iso.length === 10 ? 'UTC' : 'America/Edmonton' }) : '')
const cad = (n?: number) => (n ? `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—')

/** Upload the quote PDF, send it to the client's portal, and see when it's opened and signed. */
export function QuoteCard({ projectId, quote: q, total, deposit, recipients, previewHref }: Props) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [editing, setEditing] = useState(!q)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ text: string; err?: boolean }>()
  const file = (q?.fileName ?? 'Quote.pdf').replace(/\.pdf$/i, '')

  async function post(action: 'save' | 'send' | 'hide', send = false) {
    const body = action === 'save' && form.current ? new FormData(form.current) : new FormData()
    body.set('projectId', projectId)
    body.set('action', action)
    if (send) body.set('send', '1')
    setBusy(action === 'hide' ? 'Hiding…' : send || action === 'send' ? 'Sending…' : 'Saving…')
    setMsg(undefined)
    const r = await fetch('/api/admin/quote', { method: 'POST', body }).catch(() => null)
    const j = await r?.json().catch(() => null)
    setBusy('')
    if (!r?.ok || !j?.ok) return setMsg({ text: j?.message ?? 'That didn’t work. Try again.', err: true })
    if (j.sample) return setMsg({ text: 'Sample mode: nothing was saved or sent.' })
    // A new PDF: save a small image of its cover for the client's welcome screen.
    const pdf = body.get('file')
    if (pdf instanceof File && pdf.size > 0) {
      const img = await coverImage(pdf).catch(() => null)
      if (img) {
        const cb = new FormData()
        cb.set('projectId', projectId)
        cb.set('image', img, 'cover.jpg')
        await fetch('/api/admin/quote/cover', { method: 'POST', body: cb }).catch(() => null)
      }
    }
    setMsg({
      text: j.sent
        ? `Sent to ${j.sent.join(', ')}.${j.failed?.length ? ` Couldn’t email ${j.failed.join(', ')}.` : ''}`
        : action === 'hide' ? 'Hidden from the client.' : 'Saved.',
    })
    setEditing(false)
    router.refresh()
  }

  const status = q?.signature
    ? { tone: 'approved', text: `Signed by ${q.signature.name} · ${day(q.signature.at)}` }
    : q?.viewedAt
      ? { tone: 'awaiting-feedback', text: `Opened by ${q.viewedBy ?? 'the client'} · ${day(q.viewedAt)}` }
      : q?.sharedAt
        ? { tone: 'awaiting-feedback', text: `Sent ${day(q.lastSentAt ?? q.sharedAt)} · not opened yet` }
        : q
          ? { tone: 'in-progress', text: 'Not sent yet' }
          : null

  return (
    <section className="p-card" aria-labelledby="h-quote">
      <div className="a-card-head">
        <h2 id="h-quote" className="a-h2">Quote</h2>
        {status && <span className={`pill pill-${status.tone}`}>{status.text}</span>}
      </div>

      {q && (
        <dl className="key-dates">
          <div><dt>File</dt><dd><a className="text-link" href={`/api/admin/quote/file?projectId=${encodeURIComponent(projectId)}`} target="_blank" rel="noopener noreferrer">{file}<span className="sr-only"> (opens the PDF)</span></a> · v{q.version}</dd></div>
          {q.signature?.option && <div><dt>Package</dt><dd>{q.signature.option}</dd></div>}
          {!q.signature && q.options?.length ? (
            q.options.map((o) => <div key={o._key}><dt>{o.name}</dt><dd>{cad(o.total)}</dd></div>)
          ) : (
            <div><dt>Total, before tax</dt><dd>{cad(q.signature?.total ?? total)}</dd></div>
          )}
          <div><dt>Deposit</dt><dd>{q.signature ? cad(q.signature.deposit) : q.depositPercent ? `${q.depositPercent}% of the package` : cad(deposit)}</dd></div>
          {q.validUntil && <div><dt>Valid until</dt><dd>{day(q.validUntil)}</dd></div>}
        </dl>
      )}

      {q?.signature && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <p className="small" style={{ margin: 0 }}>
            {q.signature.name}{q.signature.title ? `, ${q.signature.title}` : ''} ({q.signature.email}) signed {q.signature.method === 'drawn' ? 'by hand' : 'by typing their name'}. Certificate {q.signature.certificateId}.
          </p>
          <div className="row-wrap">
            <a className="btn btn-primary btn-sm" href={`/api/admin/quote/file?projectId=${encodeURIComponent(projectId)}&signed=1`} target="_blank" rel="noopener noreferrer">Signed copy<span className="sr-only"> (opens the PDF)</span></a>
            <a className="btn btn-secondary btn-sm" href={`/api/admin/quote/file?projectId=${encodeURIComponent(projectId)}&signed=1&download=1`}>Download</a>
          </div>
        </div>
      )}

      {!q?.signature && !editing && q && (
        <div className="row-wrap">
          <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy) || !recipients.length} onClick={() => post('send')}>
            {busy === 'Sending…' ? busy : q.sharedAt ? 'Send again' : 'Send to client'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)} disabled={Boolean(busy)}>Edit or replace</button>
          {previewHref && <a className="text-link small" href={previewHref} target="_blank" rel="noopener noreferrer">{q.sharedAt ? 'Client’s page' : 'Preview as client'}<span className="sr-only"> (opens in a new tab)</span></a>}
          {q.sharedAt && <button type="button" className="linklike small" onClick={() => post('hide')} disabled={Boolean(busy)}>Hide from client</button>}
        </div>
      )}

      {!q?.signature && editing && (
        <form ref={form} className="stack a-quote-form" onSubmit={(e) => {
            e.preventDefault()
            post('save')
          }}>
          <div className="field">
            <label htmlFor="q-file">{q ? 'Replace the PDF (optional)' : 'Quote PDF'}</label>
            <input id="q-file" name="file" type="file" accept="application/pdf,.pdf" required={!q} className="input" />
            <span className="hint">Up to 4 MB.{q?.sharedAt ? ' A new PDF replaces the one the client sees.' : ''}</span>
          </div>
          <div className="a-quote-row">
            <div className="field">
              <label htmlFor="q-total">Total, before tax</label>
              <input id="q-total" name="total" className="input" inputMode="decimal" defaultValue={total ?? ''} placeholder="14800" />
            </div>
            <div className="field">
              <label htmlFor="q-dep">Deposit</label>
              <input id="q-dep" name="deposit" className="input" defaultValue={q?.depositPercent ? `${q.depositPercent}%` : deposit ?? ''} placeholder="7400 or 30%" />
            </div>
            <div className="field">
              <label htmlFor="q-valid">Valid until</label>
              <input id="q-valid" name="validUntil" type="date" className="input" defaultValue={q?.validUntil ?? ''} />
            </div>
          </div>
          <PackagesField initial={q?.options ?? []} />
          <div className="field">
            <label htmlFor="q-note">Note for the client <span className="muted small">(optional)</span></label>
            <textarea id="q-note" name="note" className="input a-quote-text" rows={2} maxLength={400} defaultValue={q?.note ?? ''} placeholder="Krystle, thanks for the call today. Here’s what we talked through." />
            <span className="hint">Shown with your photo when they first open the quote, and at the top of the quote page.</span>
          </div>
          <div className="field">
            <label htmlFor="q-sum">Summary for the client</label>
            <textarea id="q-sum" name="summary" className="input a-quote-text" rows={3} defaultValue={q?.summary ?? ''} placeholder="One or two sentences on what they’re getting." />
          </div>
          <div className="field">
            <label htmlFor="q-inc">What’s included</label>
            <textarea id="q-inc" name="includes" className="input a-quote-text" rows={5} defaultValue={(q?.includes ?? []).join('\n')} placeholder={'One per line\nTwo shoot days\nEdit with two rounds of changes'} />
          </div>
          <div className="row-wrap">
            <button type="submit" className="btn btn-secondary btn-sm" disabled={Boolean(busy)}>{busy === 'Saving…' ? busy : 'Save'}</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy) || !recipients.length} onClick={() => form.current?.reportValidity() && post('save', true)}>
              {busy === 'Sending…' ? busy : q?.sharedAt ? 'Save and send again' : 'Save and send to client'}
            </button>
            {q && <button type="button" className="linklike small" onClick={() => setEditing(false)} disabled={Boolean(busy)}>Cancel</button>}
          </div>
        </form>
      )}

      {!q?.signature && (
        <p className="muted small" style={{ margin: 0 }}>
          {recipients.length
            ? `Sending emails ${recipients.join(', ')} a link to review and sign it in their portal. Signing moves the project to Booked.`
            : 'Add a contact for this client in the Studio before sending.'}
        </p>
      )}
      <p className={`small ${msg?.err ? 'err' : 'muted'}`} role="status" style={{ margin: 0 }}>{busy || msg?.text}</p>
    </section>
  )
}

type Row = { id: number; name: string; total: string; note: string }

/** One row per package, so every tier is in view. Sent as "name | price | note" lines. */
function PackagesField({ initial }: { initial: NonNullable<OfficeQuote['options']> }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((o, i) => ({ id: i, name: o.name, total: String(o.total), note: o.note ?? '' })))
  const set = (id: number, f: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...f } : x)))
  const value = rows.filter((r) => r.name.trim() && r.total.trim()).map((r) => [r.name.trim(), r.total.replace(/[$,\s]/g, ''), r.note.trim()].filter(Boolean).join(' | ')).join('\n')
  return (
    <fieldset className="field a-packages">
      <legend>Packages <span className="muted small">(optional)</span></legend>
      <input type="hidden" name="options" value={value} />
      {rows.map((r, i) => (
        <div key={r.id} className="a-package-row">
          <input className="input" aria-label={`Package ${i + 1} name`} placeholder="The Story" value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} />
          <input className="input" aria-label={`Package ${i + 1} price, before tax`} placeholder="10200" inputMode="decimal" value={r.total} onChange={(e) => set(r.id, { total: e.target.value })} />
          <input className="input" aria-label={`Package ${i + 1} short note`} placeholder="Adds highlights (optional)" value={r.note} onChange={(e) => set(r.id, { note: e.target.value })} />
          <button type="button" className="linklike small" onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))}>Remove<span className="sr-only"> package {i + 1}</span></button>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((x) => [...x, { id: Date.now(), name: '', total: '', note: '' }])} disabled={rows.length >= 6}>
          Add a package
        </button>
      </div>
      <span className="hint">With packages, the client picks one when signing and the total follows it. A deposit like 30% does too.</span>
    </fieldset>
  )
}
