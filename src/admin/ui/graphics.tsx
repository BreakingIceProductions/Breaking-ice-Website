import type { CSSProperties, ReactNode } from 'react'

/**
 * The back office's small graphics: bar, split bar, donut, ring, mini columns and day strip.
 * Pure SVG and CSS, sized by their container, coloured from the admin tokens (styles: the `.gx-` block in admin.css).
 * The drawings are decorative (`aria-hidden`): each one sits beside the same numbers written as text,
 * and the legends, ring captions and day cells are that text.
 */

const pct = (value: number, max = 1) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0)
const vars = (v: Record<string, string>) => v as CSSProperties

/** Marks cycle through one copper, the text colour at three strengths, a second copper, then a hollow one. */
const TONES = 6
export type Tone = 'accent' | 'text' | 'strong' | 'soft' | 'alt' | 'dashed'
const TONE_CLASS: Record<Tone, string> = { accent: 'gx-t0', text: 'gx-t1', strong: 'gx-t2', soft: 'gx-t3', alt: 'gx-t4', dashed: 'gx-dashed' }
const toneAt = (i: number) => `gx-t${i % TONES}`

/** A value against a whole (0 to 1). The tick marks a goal or an even pace. */
export function Bar({ value, tick, thin }: { value: number; tick?: number; thin?: boolean }) {
  return (
    <span className={`gx-bar${thin ? ' gx-bar-thin' : ''}${tick !== undefined ? ' has-tick' : ''}`} aria-hidden="true">
      <span className="gx-track">{value > 0 && <span className="gx-fill" style={{ width: `${pct(value)}%` }} />}</span>
      {tick !== undefined && <span className="gx-tick" style={{ left: `${pct(tick)}%` }} />}
    </span>
  )
}

export type Part = { label: string; value: number; /** The number as it reads in the legend. */ text?: string; tone?: Tone }

/** A swatch, a label and its number for each part. This is the text version of the drawing beside it. */
export function Legend({ parts, stacked }: { parts: (Part & { note?: string })[]; stacked?: boolean }) {
  return (
    <ul className={`gx-legend${stacked ? ' gx-legend-stacked' : ''}`}>
      {parts.map((p, i) => (
        <li key={p.label}>
          <span className={`gx-key ${p.tone ? TONE_CLASS[p.tone] : toneAt(i)}`} aria-hidden="true" />
          <span className="gx-legend-label">{p.label}</span>
          {p.text !== undefined && <span className="gx-legend-num">{p.text}</span>}
          {p.note && <span className="gx-legend-note">{p.note}</span>}
        </li>
      ))}
    </ul>
  )
}

/** One whole in two or more parts, side by side. Parts of zero are left out of the bar and kept in the legend. */
export function SplitBar({ parts, legend = true }: { parts: Part[]; legend?: boolean }) {
  const total = parts.reduce((n, p) => n + Math.max(0, p.value), 0)
  return (
    <span className="gx-split-wrap">
      <span className="gx-split" aria-hidden="true">
        {total > 0 ? parts.map((p, i) => p.value > 0 && <span key={p.label} className={p.tone ? TONE_CLASS[p.tone] : toneAt(i)} style={{ flexGrow: p.value / total }} />) : <span className="gx-split-none" />}
      </span>
      {legend && <Legend parts={parts} />}
    </span>
  )
}

function Circle({ parts }: { parts: { key: string; share: number; cls: string }[] }) {
  // pathLength makes the circumference 100, so a share is its own dash length.
  const gap = parts.filter((p) => p.share > 0).length > 1 ? 1.2 : 0
  let at = 0
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle className="gx-ring-track" cx="60" cy="60" r="48" pathLength={100} />
      {parts.map((p) => {
        const start = at
        at += p.share
        const len = Math.max(0, p.share - gap)
        if (len <= 0) return null
        return <circle key={p.key} className={`gx-arc ${p.cls}`} cx="60" cy="60" r="48" pathLength={100} strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={-start - gap / 2} transform="rotate(-90 60 60)" />
      })}
    </svg>
  )
}

/** Shares of a whole, with the total in the middle and a legend beside it. */
export function Donut({ parts, total, totalLabel }: { parts: (Part & { note?: string })[]; total: string; totalLabel: string }) {
  const sum = parts.reduce((n, p) => n + Math.max(0, p.value), 0)
  return (
    <div className="gx-donut">
      <div className="gx-donut-ring">
        <Circle parts={parts.map((p, i) => ({ key: p.label, share: pct(p.value, sum), cls: toneAt(i) }))} />
        <p className="gx-donut-mid">
          <strong>{total}</strong>
          <span>{totalLabel}</span>
        </p>
      </div>
      <Legend parts={parts} stacked />
    </div>
  )
}

/** One share as a small ring, the percentage inside it. `value` is 0 to 100, or null when there is nothing to divide by. */
export function Ring({ value, children }: { value: number | null; children?: ReactNode }) {
  return (
    <span className="gx-ring">
      <Circle parts={[{ key: 'v', share: pct(value ?? 0, 100), cls: 'gx-t0' }]} />
      <span className="gx-ring-mid">{children ?? (value === null ? '—' : `${value}%`)}</span>
    </span>
  )
}

/** A row of small columns on one scale, a short label under each. The current one is copper. */
export function MiniCols({ cols, showValues }: { cols: { label: string; value: number; text?: string; current?: boolean }[]; showValues?: boolean }) {
  const max = Math.max(...cols.map((c) => c.value), 0)
  return (
    <span className={`gx-cols${showValues ? ' gx-cols-values' : ''}`} style={vars({ '--gx-n': String(cols.length) })}>
      {cols.map((c, i) => (
        <span key={`${c.label}-${i}`} className={`gx-col${c.current ? ' is-current' : ''}`}>
          {showValues && <span className="gx-col-num">{c.text ?? c.value}</span>}
          <span className="gx-col-plot" aria-hidden="true"><span className="gx-col-fill" style={{ height: `${pct(c.value, max)}%` }} /></span>
          <span className="gx-col-label" aria-hidden={showValues ? undefined : true}>{c.label}</span>
        </span>
      ))}
    </span>
  )
}

export type DayCell = { key: string; label: string; value: ReactNode; note?: ReactNode; /** 0 to 1: how strongly the cell is shaded. */ level?: number; current?: boolean }

/** Equal cells in a row, shaded by how much happened, with the number written in each. */
export function DayStrip({ cells, label }: { cells: DayCell[]; label: string }) {
  return (
    <ol className="gx-days" aria-label={label} style={vars({ '--gx-n': String(cells.length) })}>
      {cells.map((c) => (
        <li key={c.key} className={c.current ? 'is-current' : undefined} style={vars({ '--gx-shade': `${Math.round(pct(c.level ?? 0) * 0.34)}%` })}>
          <span className="gx-day-label">{c.label}</span>
          <span className="gx-day-num">{c.value}</span>
          {c.note !== undefined && <span className="gx-day-note">{c.note}</span>}
        </li>
      ))}
    </ol>
  )
}

/**
 * Equal segments in a row: the first `done` filled, then the `current` one copper, the rest empty.
 * For a stage (6 of 7) or a count (1 of 2 payments). Unlike the drawings above it carries its own
 * text, as `label` (role="img"), so it can stand alone.
 */
export function Segments({ total, done, current, label, big }: { total: number; done: number; /** Index of the copper segment, if any. */ current?: number; label: string; big?: boolean }) {
  return (
    <span className={`gx-seg${big ? ' gx-seg-big' : ''}`} role="img" aria-label={label}>
      {Array.from({ length: Math.max(0, total) }, (_, i) => (
        <span key={i} className={i === current ? 'is-current' : i < done ? 'is-done' : undefined} />
      ))}
    </span>
  )
}

/** A status dot. `tone`: copper for "with you", ink for done, hollow for waiting, faint for not started. */
export function Dot({ tone = 'quiet', label }: { tone?: 'accent' | 'done' | 'wait' | 'quiet'; label?: string }) {
  return <span className={`gx-dot gx-dot-${tone}`} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} />
}
