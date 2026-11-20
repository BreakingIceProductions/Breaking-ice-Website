'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { MonthKey, RetainerMonth } from '@/retainer/types'
import { postJson } from './retainer-settings'

type Recap = NonNullable<RetainerMonth['recap']>

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Edmonton' }) : '')

/**
 * The month-end recap: the draft (written on the 1st, or now with "Draft it"), an editable body, a branded
 * preview, and Send behind a confirm step. Nothing is ever sent without Josh pressing Send and confirming.
 */
export function RetainerRecap({ clientId, month, monthName, recap, to, readOnly }: { clientId: string; month: MonthKey; monthName: string; recap?: Recap; to: string[]; readOnly?: boolean }) {
  const router = useRouter()
  const [subject, setSubject] = useState(recap?.subject ?? '')
  const [body, setBody] = useState(recap?.body ?? '')
  const [html, setHtml] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const sent = Boolean(recap?.sentAt)
  const locked = readOnly || sent
  const dirty = subject !== (recap?.subject ?? '') || body !== (recap?.body ?? '')

  async function run(action: 'draft' | 'save' | 'preview' | 'send') {
    setBusy(action)
    setMsg('')
    const r = await postJson('/api/admin/retainer/recap', { clientId, month, action, subject, body, ...(action === 'send' ? { confirmed: true } : {}) })
    setBusy('')
    if (!r.ok) return setMsg(r.message || 'That didn’t work. Try again.')
    if (action === 'preview') return setHtml(String(r.html ?? ''))
    if (action === 'draft') {
      setSubject(String(r.subject ?? ''))
      setBody(String(r.body ?? ''))
      setHtml('')
      setMsg(`${r.sample ? 'Sample data: drafted here, not saved.' : 'Drafted from this month’s records. Not sent.'}${r.note ? ` ${r.note}` : ''}`)
    }
    if (action === 'save') setMsg(r.sample ? 'Sample data: not saved.' : 'Saved. Not sent.')
    if (action === 'send') {
      setConfirming(false)
      setMsg(r.message || 'Sent.')
    }
    router.refresh()
  }

  const status = sent
    ? `Sent ${when(recap?.sentAt)}${recap?.sentTo?.length ? ` to ${recap.sentTo.join(', ')}` : ''}.`
    : recap?.draftedAt
      ? `Drafted ${when(recap.draftedAt)}. Not sent yet.`
      : `No draft yet. It’s written automatically on the 1st; you can draft it now.`

  return (
    <div className="stack rt-recap" style={{ gap: 'var(--space-4)' }}>
      <p className="small muted" style={{ margin: 0 }}>{status}</p>

      <div className="field">
        <label htmlFor="rt-subject">Subject</label>
        <input id="rt-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor="rt-body">Email</label>
        <span className="hint">Plain text. A blank line starts a paragraph; a line like [button: Label](https://…) becomes a button.</span>
        <textarea id="rt-body" className="input" value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} maxLength={10000} />
      </div>

      <div className="row-wrap">
        {!locked && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => (!body.trim() || !dirty || confirm('Replace what’s here with a fresh draft from this month’s records?')) && run('draft')}>
              {busy === 'draft' ? 'Drafting…' : body.trim() ? 'Draft it again' : 'Draft it now'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy) || !dirty || !subject.trim() || !body.trim()} onClick={() => run('save')}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
          </>
        )}
        <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy) || !body.trim()} onClick={() => run('preview')}>{busy === 'preview' ? 'Loading…' : 'Preview'}</button>
        {!locked && (
          <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy) || !subject.trim() || !body.trim() || !to.length} onClick={() => setConfirming(true)}>Send…</button>
        )}
        <span className="small muted" role="status">{msg}</span>
      </div>
      {!locked && !to.length && <p className="small muted" style={{ margin: 0 }}>No contact on this client gets emails, so it can’t be sent. Add one in the Studio.</p>}

      {confirming && (
        <div className="rt-confirm" role="alertdialog" aria-labelledby="rt-confirm-h" aria-describedby="rt-confirm-d">
          <strong id="rt-confirm-h">Send the {monthName} recap now?</strong>
          <p id="rt-confirm-d" className="small" style={{ margin: 0 }}>
            One email each to {to.join(', ')}, with a copy to you. {dirty ? 'Your edits are saved as it goes out. ' : ''}It can’t be unsent.
          </p>
          <div className="row-wrap">
            <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => run('send')} autoFocus>{busy === 'send' ? 'Sending…' : 'Yes, send it'}</button>
            <button type="button" className="linklike small" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}

      {html && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
            <span className="small muted">Preview: how it looks in their inbox</span>
            <button type="button" className="linklike small" onClick={() => setHtml('')}>Close preview</button>
          </div>
          <iframe className="rt-preview" title={`Preview of the ${monthName} recap email`} srcDoc={html} sandbox="" />
        </div>
      )}
    </div>
  )
}
