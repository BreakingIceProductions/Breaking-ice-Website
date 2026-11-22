import type { ReactNode } from 'react'

/**
 * Calm-card helpers for the second simplification pass (Client portals, Quote builder, Library, Settings,
 * Retainers, Galleries, Review room). Server-safe: no state. Styles: `.sd-` in admin-simple-d.css, plus the
 * step bar from admin-simple-a.css (`.sa-qsteps`), so import both where these are used.
 */

export type Step = { key: string; label: string; on: boolean; when?: string }

/**
 * Sent › Opened › Signed (or any steps), each bar filled once it's happened, the latest one copper.
 * The same picture as the quote card on the project page. `label` names the whole bar for screen readers.
 */
export function StepBar({ steps, label, compact }: { steps: Step[]; label: string; compact?: boolean }) {
  const reached = steps.reduce((n, s, i) => (s.on ? i + 1 : n), 0)
  return (
    <ol className={`sa-qsteps sd-steps${compact ? ' sd-steps-compact' : ''}`} aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.key} className={s.on ? (i === reached - 1 ? 'is-current' : 'is-done') : ''}>
          <span className="sa-stage-bar" aria-hidden="true" />
          <strong>{s.label}</strong>
          {s.when !== undefined && <span className="sa-muted small">{s.when || ' '}</span>}
        </li>
      ))}
    </ol>
  )
}

/** A big number with a short label under or beside it, optionally a link. Matches Today's tiles. */
export function NumTile({ n, label, href, accent, title }: { n: number | string; label: string; href?: string; accent?: boolean; /** Longer version for hover and screen readers. */ title?: string }) {
  const body = (
    <>
      <span className={`sa-tile-num${accent ? ' sd-accent' : ''}`} aria-hidden={title ? true : undefined}>{n}</span>
      <span className="sa-tile-label" aria-hidden={title ? true : undefined}>{label}</span>
    </>
  )
  // The longer version is the tile's name for screen readers (and its hover text).
  return href ? (
    <a className="sa-tile" href={href} title={title} aria-label={title}>{body}</a>
  ) : (
    <div className="sa-tile sd-tile-static" title={title} role={title ? 'img' : undefined} aria-label={title}>{body}</div>
  )
}

/** A status dot with a word after it: green (on), amber (needs a look), grey (off / not yet). */
export function StateDot({ tone, children, label }: { tone: 'on' | 'warn' | 'off' | 'accent'; children: ReactNode; /** Longer version, on hover. */ label?: string }) {
  return (
    <span className={`sd-state sd-${tone}`} title={label}>
      <span className="sd-state-dot" aria-hidden="true" />
      <span>{children}</span>
    </span>
  )
}

/** A small round icon: a bolt for "happens by itself", a hand for "you press Send", an eye for "seen". */
export function MiniIcon({ kind }: { kind: 'auto' | 'manual' | 'eye' | 'eye-off' | 'check' }) {
  const p = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false }
  if (kind === 'auto') return <svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
  if (kind === 'manual') return <svg {...p}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
  if (kind === 'check') return <svg {...p}><path d="m5 12 5 5L20 7" /></svg>
  if (kind === 'eye-off') return <svg {...p}><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1" /></svg>
  return <svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
}
