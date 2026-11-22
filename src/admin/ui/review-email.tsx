'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useConfirm } from './confirm'

type Item = { key: string; title: string; version: number; emailed: boolean }

/** Pick versions that are with the client and send them in one "ready for review" email. */
export function ReviewEmail({ projectId, items, to }: { projectId: string; items: Item[]; to: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(() => new Set(items.filter((i) => !i.emailed).map((i) => i.key)))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const [msg, setMsg] = useState('')
  if (!items.length) return null

  const toggle = (k: string) => setPicked((s) => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  })

  async function send() {
    if (!picked.size || !(await confirm({ title: `Email ${to}?`, body: `About ${picked.size} version${picked.size === 1 ? '' : 's'} ready to review.`, confirmLabel: 'Send' }))) return
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/admin/review-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, keys: [...picked], note }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    setMsg(j.message || (r?.ok ? 'Sent.' : 'That didn’t send. Try again.'))
    if (r?.ok) {
      setOpen(false)
      router.refresh()
    }
  }

  if (!open)
    return (
      <span className="row-wrap">
        <button type="button" className="linklike small" onClick={() => setOpen(true)}>Email the client…</button>
        <span className="small muted" role="status">{msg}</span>
      </span>
    )
  return (
    <div className="stack gap-8px py-3">
      <p className="small muted m0">One email to {to} listing what you tick. Already-emailed versions start unticked.</p>
      <ul className="stack gap-4px list-reset">
        {items.map((i) => (
          <li key={i.key}>
            <label className="row-wrap small">
              <input type="checkbox" checked={picked.has(i.key)} onChange={() => toggle(i.key)} />
              {i.title} · v{i.version}{i.emailed ? <span className="muted"> · emailed</span> : null}
            </label>
          </li>
        ))}
      </ul>
      <label className="stack small gap-4px">
        Personal note (optional)
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <span className="row-wrap">
        <button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={busy || !picked.size}>{busy ? 'Sending…' : `Send ${picked.size || ''} in one email`}</button>
        <button type="button" className="linklike small" onClick={() => setOpen(false)}>Cancel</button>
        <span className="small muted" role="status">{msg}</span>
      </span>
    </div>
  )
}
