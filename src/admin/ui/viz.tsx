'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Calm-card helpers for the simplified back-office pages (Money, Gallery, Retainer client): a goal ring with
 * an on-pace tick, a column chart, an age chip that warms as a bill gets older, initials, a status chip, a small
 * "?" toggle for the rare explanation that's still needed, and a settings drawer. Styles: `.sb-` in
 * admin-simple-b.css. Every drawing is aria-hidden or carries its own text via aria-label; the numbers are
 * always reachable as text.
 */

const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** A progress ring. `share` 0..1 (more than 1 draws a full ring); `tick` 0..1 marks an even pace in copper. */
export function GoalRing({ share, tick, size = 96, label, children }: { share: number | null; tick?: number; size?: number; /** The ring as one sentence (it then reads as an image with that name). */ label?: string; children?: ReactNode }) {
  const r = 42
  const c = 2 * Math.PI * r
  const fill = clamp(share ?? 0)
  return (
    <span className="sb-ring" style={{ '--sb-ring': `${size}px` } as CSSProperties} role={label ? 'img' : undefined} aria-label={label} title={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="sb-ring-track" cx="50" cy="50" r={r} />
        {fill > 0 && <circle className="sb-ring-fill" cx="50" cy="50" r={r} strokeDasharray={`${fill * c} ${c}`} transform="rotate(-90 50 50)" />}
        {tick !== undefined && <line className="sb-ring-tick" x1="50" y1="1" x2="50" y2="17" transform={`rotate(${clamp(tick) * 360} 50 50)`} />}
      </svg>
      <span className="sb-ring-mid" aria-hidden={label ? true : undefined}>{children}</span>
    </span>
  )
}

export type Col = {
  label: string
  /** What sits under the column (e.g. "J"). Defaults to the label. */
  short?: string
  value: number
  /** A second series drawn beside the first, striped. */
  value2?: number
  /** Hover text for the column. */
  title?: string
  /** Shown above the column. */
  text?: string
  current?: boolean
  future?: boolean
}

/**
 * Columns on one scale. `label` is the whole chart as one sentence for screen readers, so the columns
 * themselves are decorative; the numbers are also in a folded table or the `text` above each column.
 */
export function ColChart({ cols, label, height = 160, legend }: { cols: Col[]; label: string; height?: number; legend?: [string, string] }) {
  const max = Math.max(...cols.flatMap((c) => [c.value, c.value2 ?? 0]), 0)
  const h = (v: number) => `${max > 0 ? Math.max(v > 0 ? 3 : 0, (v / max) * 100) : 0}%`
  return (
    <figure className="sb-cols-wrap">
      {legend && (
        <ul className="sb-legend" aria-hidden="true">
          <li><span className="sb-key" />{legend[0]}</li>
          <li><span className="sb-key sb-alt" />{legend[1]}</li>
        </ul>
      )}
      <div className="sb-cols" role="img" aria-label={label} style={{ '--sb-n': String(cols.length), '--sb-h': `${height}px` } as CSSProperties}>
        {cols.map((c, i) => (
          <span key={`${c.label}-${i}`} className={`sb-col${c.current ? ' is-current' : ''}${c.future ? ' is-future' : ''}`} title={c.title}>
            {c.text !== undefined && <span className="sb-col-num" aria-hidden="true">{c.text}</span>}
            <span className="sb-col-plot" aria-hidden="true">
              <span className="sb-col-bar" style={{ height: c.future ? '4%' : h(c.value) }} />
              {c.value2 !== undefined && <span className="sb-col-bar sb-alt" style={{ height: c.future ? '4%' : h(c.value2) }} />}
            </span>
            <span className="sb-col-label" aria-hidden="true">{c.short ?? c.label}</span>
          </span>
        ))}
      </div>
    </figure>
  )
}

/** "18 days", warming from grey to copper as it gets older (two weeks, then a month). */
export function AgeChip({ days, label }: { days: number | null; label?: string }) {
  if (days === null) return <span className="sb-age" aria-label={label ? `${label}: no date` : 'No date'}>—</span>
  const heat = days >= 30 ? 2 : days >= 14 ? 1 : 0
  const text = days <= 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'}`
  return <span className="sb-age" data-heat={heat} aria-label={label ? `${label} ${text.toLowerCase()} ago` : undefined}>{text}</span>
}

/** Two letters from a name, in a circle. Decorative: the name is written beside it. */
export function Initials({ name }: { name: string }) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean)
  const two = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
  return <span className="sb-initials" aria-hidden="true">{two}</span>
}

export type ChipTone = 'ok' | 'warm' | 'info' | 'muted' | 'hot'

/** A short status with a coloured dot. `label` is the long version for screen readers and hover. */
export function Chip({ tone = 'muted', label, children }: { tone?: ChipTone; label?: string; children: ReactNode }) {
  return (
    <span className={`sb-chip sb-${tone}`} title={label} aria-label={label}>
      <span className="sb-dot" aria-hidden="true" />
      {children}
    </span>
  )
}

/** A small "?" that shows one explanation under it. Use sparingly. */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="sb-help">
      <button type="button" className="sb-help-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">?</span>
        <span className="sr-only">About {label}</span>
      </button>
      {open && (
        <span id={id} className="sb-help-text" role="note">
          {children}
        </span>
      )}
    </span>
  )
}

/**
 * One button that opens a panel from the side (full screen on a phone) holding a page's setup.
 * Not modal on purpose: the back office's Undo notices sit outside it and must stay clickable.
 * Escape, the close button and a click on the dim backdrop close it; focus goes back to the button.
 */
export function Drawer({ title, button, children, open: startOpen = false }: { title: string; button: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const was = useRef(open)

  useEffect(() => {
    if (open) panel.current?.focus({ preventScroll: true })
    else if (was.current) btn.current?.focus({ preventScroll: true })
    was.current = open
  }, [open])

  // Opened by a link to one of its sections (#ga-share etc.).
  useEffect(() => {
    const check = () => {
      const h = window.location.hash.slice(1)
      if (h && panel.current?.querySelector(`#${CSS.escape(h)}`)) setOpen(true)
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  return (
    <>
      <button ref={btn} type="button" className="btn btn-secondary btn-sm sb-drawer-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {button}
      </button>
      <div className="sb-scrim" hidden={!open} onClick={() => setOpen(false)} />
      <div
        ref={panel}
        id={id}
        className="sb-drawer"
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${id}-h`}
        tabIndex={-1}
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !e.defaultPrevented) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <div className="sb-drawer-head">
          <h2 id={`${id}-h`} className="a-h2 a-h2-lg">{title}</h2>
          <button type="button" className="sb-icon-btn" aria-label={`Close ${title.toLowerCase()}`} onClick={() => setOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="sb-drawer-body">{children}</div>
      </div>
    </>
  )
}
