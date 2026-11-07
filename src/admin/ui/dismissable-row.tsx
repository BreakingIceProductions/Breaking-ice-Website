'use client'

import { useState } from 'react'

/** A dashboard reminder with a × on the left. Dismissing hides it at once and saves it in the background. */
export function DismissableRow({ projectId, dismissKey, label, children }: { projectId: string; dismissKey?: string; label: string; children: React.ReactNode }) {
  const [gone, setGone] = useState(false)
  const [leaving, setLeaving] = useState(false)
  if (gone) return null

  const dismiss = () => {
    setLeaving(true)
    setTimeout(() => setGone(true), 250)
    fetch('/api/admin/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, key: dismissKey }) })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
      })
      .catch(() => {
        // Didn't save: bring it back.
        setGone(false)
        setLeaving(false)
      })
  }

  return (
    <li className={`a-row-x${leaving ? ' is-leaving' : ''}`}>
      {dismissKey ? (
        <button type="button" className="a-dismiss-btn" onClick={dismiss} title="Dismiss">
          <span aria-hidden="true">×</span>
          <span className="sr-only">Dismiss {label}</span>
        </button>
      ) : (
        <span className="a-dismiss-btn" aria-hidden="true" />
      )}
      {children}
    </li>
  )
}
