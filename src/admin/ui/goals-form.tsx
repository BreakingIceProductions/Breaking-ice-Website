'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Values = { signedYear: string; collectedYear: string; leadsMonth: string; winRate: string }

const FIELDS: { key: keyof Values; label: string }[] = [
  { key: 'signedYear', label: 'Signed this year ($ before GST)' },
  { key: 'collectedYear', label: 'Collected this year ($ before GST)' },
  { key: 'leadsMonth', label: 'New leads a month' },
  { key: 'winRate', label: 'Win rate this year (%)' },
]

/** The four goals in one small form. Leave one empty to have no goal for it. */
export function GoalsForm({ goals }: { goals: Partial<Record<keyof Values, number>> }) {
  const router = useRouter()
  const [values, setValues] = useState<Values>(() => Object.fromEntries(FIELDS.map((f) => [f.key, goals[f.key] ? String(goals[f.key]) : ''])) as Values)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/admin/money/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) return setMsg(j.message || 'That didn’t save. Reload the page and try again.')
    setMsg(j.sample ? 'Sample data: the goals weren’t saved.' : 'Goals saved.')
    router.refresh()
  }

  return (
    <details className="mn-set">
      <summary>Set goals</summary>
      <form className="g-form" onSubmit={save}>
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`goal-${f.key}`}>{f.label}</label>
            <input id={`goal-${f.key}`} className="input" inputMode="numeric" autoComplete="off" value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          </div>
        ))}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save goals'}</button>
      </form>
      <p className="small muted" role="status" style={{ margin: 0, minHeight: 20 }}>{msg}</p>
    </details>
  )
}
