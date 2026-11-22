'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { fmtDate } from '@/admin/dates'

export type SuggestionRow = { key: string; source: 'wispr' | 'email' | 'manual'; name: string; company?: string; email?: string; summary: string; when: string; title?: string }

const SOURCE = { wispr: 'From a call', email: 'Email', manual: 'Added by hand' }

const whenLabel = (iso: string) => fmtDate(iso, 'weekday')

/**
 * "Possible new leads" on Today: people from a Wispr call or an email who look like new clients.
 * Add as lead makes the lead (nothing is sent to them); Dismiss hides the suggestion. Both hide the row
 * at once and bring it back if the save fails. View-only sign-ins see the list without the buttons.
 */
export function LeadSuggestions({ items, canAct }: { items: SuggestionRow[]; canAct: boolean }) {
  const router = useRouter()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [added, setAdded] = useState<{ name: string; href: string } | null>(null)
  const shown = items.filter((s) => !hidden.has(s.key))

  const act = async (s: SuggestionRow, action: 'accept' | 'dismiss') => {
    setBusy(s.key)
    setError('')
    setAdded(null)
    setHidden((h) => new Set(h).add(s.key))
    try {
      const r = await fetch('/api/admin/lead-suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, key: s.key }) })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string; href?: string; sample?: boolean }
      if (!r.ok || !j.ok) throw new Error(j.message || 'That didn’t save. Try again.')
      if (action === 'accept' && j.href) setAdded({ name: s.name, href: j.href })
      router.refresh()
    } catch (e) {
      setHidden((h) => {
        const n = new Set(h)
        n.delete(s.key)
        return n
      })
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.')
    } finally {
      setBusy('')
    }
  }

  if (!shown.length && !added && !error) return null
  return (
    <section className="p-card td-sugg" aria-labelledby="td-sugg-h">
      <div className="a-card-head">
        <h2 id="td-sugg-h" className="a-h2">Possible new leads</h2>
        <span className="muted small">Found in calls and emails. Nothing has been sent to them.</span>
      </div>
      {added && (
        <p className="small td-sugg-note" role="status">
          {added.name} is now a lead. <Link className="text-link" href={added.href}>Open the lead</Link>
        </p>
      )}
      {error && (
        <p className="small a-urgent td-sugg-note" role="alert">
          {error}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="td-list">
          {shown.map((s) => (
            <li key={s.key} className="td-sugg-row">
              <div className="td-item">
                <strong>
                  {s.name}
                  {s.company ? <span className="td-sugg-co">, {s.company}</span> : null}
                </strong>
                <span className="muted">
                  {SOURCE[s.source]}
                  {s.title ? `: ${s.title}` : ''}
                  {whenLabel(s.when) ? ` · ${whenLabel(s.when)}` : ''}
                  {s.email ? ` · ${s.email}` : ''}
                </span>
                <span className="td-sugg-summary">{s.summary}</span>
              </div>
              {canAct && (
                <span className="btn-row td-sugg-actions">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => act(s, 'accept')}>
                    Add as lead<span className="sr-only">: {s.name}</span>
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => act(s, 'dismiss')}>
                    Dismiss<span className="sr-only">: {s.name}</span>
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
