'use client'

import { useEffect, useState } from 'react'

/** A collapsible pipeline section. Remembers open or closed per browser. */
export function Bucket({ id, title, count, closed, children }: { id: string; title: string; count: number; closed?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!closed)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`bucket:${id}`)
      if (saved) setOpen(saved === 'open')
    } catch {}
  }, [id])
  return (
    <details
      className="p-card a-bucket"
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
        <h2 className="a-h2">{title}</h2>
        <span className="muted small">{count}</span>
      </summary>
      {children}
    </details>
  )
}
