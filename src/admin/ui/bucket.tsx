'use client'

import { useEffect, useState } from 'react'

/** A collapsible pipeline section, or (nested) a client within one. Remembers open or closed per browser. */
export function Bucket({ id, title, count, closed, nested, children }: { id: string; title: string; count: number; closed?: boolean; nested?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!closed)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`bucket:${id}`)
      if (saved) setOpen(saved === 'open')
    } catch {}
  }, [id])
  return (
    <details
      className={nested ? 'a-bucket a-client-group' : 'p-card a-bucket'}
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open
        setOpen(now)
        try {
          localStorage.setItem(`bucket:${id}`, now ? 'open' : 'closed')
        } catch {}
      }}
    >
      <summary className="a-card-head a-bucket-head">
        {nested ? <h3 className="a-client-name">{title}</h3> : <h2 className="a-h2">{title}</h2>}
        <span className="muted small">{count}</span>
      </summary>
      {children}
    </details>
  )
}
