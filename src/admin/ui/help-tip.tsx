'use client'

import { useId, useState } from 'react'

/**
 * A small "?" that shows a short explanation underneath when pressed. For the few how-it-works
 * notes worth keeping: the page reads without them, and they're one press away.
 */
export function HelpTip({ label, children }: { /** What the note is about, for screen readers: "About portal payments". */ label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="sa-help">
      <button type="button" className="sa-help-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">?</span>
        <span className="sr-only">{label}</span>
      </button>
      <span id={id} className="sa-help-text" hidden={!open}>{children}</span>
    </span>
  )
}

/** A button that shows or hides what's under it (a rarely used form, a long list). */
export function Reveal({ label, openLabel, className, children, startOpen }: { label: React.ReactNode; openLabel?: React.ReactNode; className?: string; children: React.ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(startOpen))
  const id = useId()
  return (
    <div className={`sa-reveal ${className ?? ''}`}>
      <button type="button" className="btn btn-secondary btn-sm sa-reveal-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {open ? (openLabel ?? label) : label}
      </button>
      <div id={id} hidden={!open} className="sa-reveal-body">{children}</div>
    </div>
  )
}
