'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useNotify } from './confirm'

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
  const notify = useNotify()
  const saved = Object.fromEntries(FIELDS.map((f) => [f.key, goals[f.key] ? String(goals[f.key]) : ''])) as Values

  async function put(next: Values) {
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/admin/money/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) {
      setMsg(j.message || 'That didn’t save. Reload the page and try again.')
      return null
    }
    router.refresh()
    return j as { sample?: boolean }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    // What was saved before, so Undo can put it back.
    const before = saved
    const j = await put(values)
    if (!j) return
    setMsg(j.sample ? 'Sample data: the goals weren’t saved.' : 'Goals saved.')
    if (!j.sample && FIELDS.some((f) => before[f.key] !== values[f.key]))
      notify({
        text: 'Goals saved.',
        undo: async () => {
          setValues(before)
          if (await put(before)) setMsg('Goals put back as they were.')
        },
      })
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
      <p className="small muted m0 status-line" role="status">{msg}</p>
    </details>
  )
}
