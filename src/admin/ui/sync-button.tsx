'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SyncButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function sync() {
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/admin/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    setMsg(r?.ok ? j.message : j.message || 'Sync failed. The scheduler will try again in 10 minutes.')
    if (r?.ok) router.refresh()
  }
  return (
    <span className="row-wrap">
      <button type="button" className="linklike small" onClick={sync} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</button>
      <span className="small muted" role="status">{msg}</span>
    </span>
  )
}
