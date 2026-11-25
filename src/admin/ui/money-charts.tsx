import type { CSSProperties, ReactNode } from 'react'

/**
 * The Money page's charts, built from plain HTML and small inline SVGs (styles: `.mc-` in admin-simple-b.css).
 * Each drawing is either aria-hidden beside the same numbers written as text, or carries the numbers in its
 * own accessible name (role="img"). Colours come from the admin tokens, so light and dark both work.
 */

const share = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0)
const pc = (n: number) => `${n}%`

export type BarRow = { label: string; value: number; text: string; note?: string; /** Muted, right after the label (e.g. "3×"). */ tag?: string }

/** One bar a row, longest first or in the order given. The first bar is copper, the rest ink-grey. */
export function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0)
  if (!rows.length || max <= 0) return <p className="muted small mn-empty">{empty}</p>
  return (
    <ul className="mc-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="mc-bar-label">{r.label}{r.tag && <span className="mc-bar-tag"> {r.tag}</span>}</span>
          <span className="mc-bar-num">{r.text}</span>
          <span className="mc-track" aria-hidden="true"><span className="mc-fill" style={{ width: pc(share(r.value, max)) }} /></span>
          {r.note && <span className="mc-bar-note">{r.note}</span>}
        </li>
      ))}
    </ul>
  )
}

/** A value against its goal: the fill, and a tick for where an even pace puts you today. Decorative. */
export function Meter({ value, tick }: { /** 0..1 (more than 1 fills it). */ value: number; tick?: number }) {
  return (
    <span className="mc-meter" aria-hidden="true">
      <span className="mc-meter-track">{value > 0 && <span className="mc-meter-fill" style={{ width: pc(share(value, 1)) }} />}</span>
      {tick !== undefined && <span className="mc-meter-tick" style={{ left: pc(share(tick, 1)) }} />}
    </span>
  )
}

/** Shares of a whole as a ring, the total in the middle. `label` names it for screen readers. Tones follow the gx- swatches. */
export function ShareRing({ parts, total, totalLabel, label, size = 132 }: { parts: { key: string; value: number; /** gx- tone index; defaults to the part's place. */ tone?: number }[]; total: string; totalLabel: string; label: string; size?: number }) {
  const sum = parts.reduce((n, p) => n + Math.max(0, p.value), 0)
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 1.4 : 0
  let at = 0
  return (
    <span className="mc-ring" role="img" aria-label={label} style={{ '--mc-ring': `${size}px` } as CSSProperties}>
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle className="mc-ring-track" cx="60" cy="60" r="48" pathLength={100} />
        {parts.map((p, i) => {
          const s = share(p.value, sum)
          const start = at
          at += s
          const len = Math.max(0, s - gap)
          if (len <= 0) return null
          return <circle key={p.key} className={`mc-arc gx-t${(p.tone ?? i) % 6}`} cx="60" cy="60" r="48" pathLength={100} strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={-start - gap / 2} transform="rotate(-90 60 60)" />
        })}
      </svg>
      <span className="mc-ring-mid" aria-hidden="true"><strong>{total}</strong><span>{totalLabel}</span></span>
    </span>
  )
}

/** A swatch matching ShareRing's arc at the same index. */
export const Swatch = ({ i }: { i: number }) => <span className={`gx-key mc-swatch gx-t${i % 6}`} aria-hidden="true" />

/** Per row: a total with a part of it highlighted ("7 leads, 4 signed"). Bars share one scale. */
export function PartBars({ rows, empty }: { rows: { label: string; total: number; part: number; text: string; partText?: string }[]; empty: string }) {
  const max = Math.max(...rows.map((r) => r.total), 0)
  if (!rows.length || max <= 0) return <p className="muted small mn-empty">{empty}</p>
  return (
    <ul className="mc-parts">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="mc-bar-label">{r.label}</span>
          <span className="mc-bar-num">{r.text}{r.partText && <span className="mc-bar-tag"> · {r.partText}</span>}</span>
          <span className="mc-part-track" aria-hidden="true" style={{ width: pc(share(r.total, max)) }}>
            {r.part > 0 && <span className="mc-fill" style={{ width: pc(share(r.part, r.total)) }} />}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Equal boxes in a row with the count in each; the busiest is copper. `label` names the row for screen readers. */
export function DayBoxes({ days, label }: { days: { label: string; short: string; count: number }[]; label: string }) {
  const most = Math.max(...days.map((d) => d.count), 0)
  return (
    <ol className="mc-days" role="img" aria-label={label}>
      {days.map((d) => (
        <li key={d.label} className={d.count === most && most > 0 ? 'is-top' : undefined} style={{ '--mc-shade': `${Math.round(share(d.count, most) * 0.45)}%` } as CSSProperties} aria-hidden="true">
          <span className="mc-day-box">{d.count}</span>
          <span className="mc-day-label">{d.short}</span>
        </li>
      ))}
    </ol>
  )
}

/** Signed copper, still open grey, lost ink, not a fit deep copper, then the quieter ones. */
const OUT_TONE = [0, 3, 1, 4, 5, 2]

/** One stacked bar of a whole, and a grid of the parts with count and share. Parts past the first four show only when they have any. */
export function Outcomes({ parts, total }: { parts: { label: string; count: number }[]; total: number }) {
  const shown = parts.filter((p, i) => i < 4 || p.count > 0)
  return (
    <div className="mc-out">
      <span className="gx-split mc-out-bar" aria-hidden="true">
        {total > 0 ? shown.map((p, i) => p.count > 0 && <span key={p.label} className={`gx-t${OUT_TONE[i] ?? i}`} style={{ flexGrow: p.count / total }} />) : <span className="gx-split-none" />}
      </span>
      <ul className="mc-out-grid">
        {shown.map((p, i) => (
          <li key={p.label}>
            <span className="mc-out-label"><span className={`gx-key gx-t${OUT_TONE[i] ?? i}`} aria-hidden="true" />{p.label}</span>
            <strong className="mc-out-num">{p.count}</strong>
            <span className="mc-out-pct">{total ? Math.round((p.count / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type YearMonth = { label: string; future: boolean; signedRun: number; collectedRun: number; pace?: number }

/**
 * Running totals through the year: signed (copper, shaded) and collected (ink), against a dashed even pace
 * to the signed goal. Finished months are plotted at their end and the current month at today, which is
 * marked. The drawing stretches to its box, so the month names and the legend are HTML.
 * `projected` (share of the year, amount) continues collected as a dashed line from today to the year end (`projectedTo`), adding
 * the recurring invoices Zoho Books will make; it's labelled Projected and never mixed into Collected.
 */
export function YearLines({ months, goal, yearGone, format, projected, projectedTo = 'year end', children }: { months: YearMonth[]; goal?: number; yearGone: number; format: (n: number) => string; projected?: { at: number; amount: number }[]; projectedTo?: string; children?: ReactNode }) {
  const W = 1000
  const H = 240
  const PAD = 8
  const done = months.filter((m) => !m.future)
  const last = done.at(-1)
  const future = last && projected?.length ? projected.filter((p) => p.at >= yearGone && p.at <= 1).sort((a, b) => a.at - b.at) : []
  const projectedEnd = future.length && last ? last.collectedRun + future.reduce((n, p) => n + p.amount, 0) : undefined
  const top = Math.max(goal ?? 0, last?.signedRun ?? 0, last?.collectedRun ?? 0, projectedEnd ?? 0, 1)
  const x = (i: number) => (i === done.length - 1 ? yearGone : (i + 1) / 12) * W
  const y = (v: number) => H - PAD - (v / top) * (H - PAD * 2)
  const line = (key: 'signedRun' | 'collectedRun') => `M0,${y(0)} ${done.map((m, i) => `L${x(i).toFixed(1)},${y(m[key]).toFixed(1)}`).join(' ')}`
  const nowX = last ? x(done.length - 1) : 0
  // Flat until each invoice date, then up by its amount, then flat to the year end.
  let run = last?.collectedRun ?? 0
  const projPath = projectedEnd !== undefined
    ? `M${nowX.toFixed(1)},${y(run).toFixed(1)} ${future.map((p) => { const px = (p.at * W).toFixed(1); const before = y(run).toFixed(1); run += p.amount; return `L${px},${before} L${px},${y(run).toFixed(1)}` }).join(' ')} L${W},${y(run).toFixed(1)}`
    : ''
  const summary = last
    ? `Running totals to today: ${format(last.signedRun)} signed, ${format(last.collectedRun)} collected${goal ? `, against an even pace of ${format(goal * yearGone)} toward a ${format(goal)} signed goal` : ''}${projectedEnd !== undefined ? `, projected ${format(projectedEnd)} collected by ${projectedTo} with recurring invoices` : ''}. Month by month: ${done.map((m) => `${m.label} ${format(m.signedRun)} signed, ${format(m.collectedRun)} collected`).join('; ')}.`
    : 'Nothing recorded yet this year.'
  return (
    <figure className="mc-year">
      <div className="mc-plot">
        {goal ? <span className="mc-goal-tag" aria-hidden="true">Goal {format(goal)}</span> : null}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
          {[0.25, 0.5, 0.75, 1].map((f) => <path key={f} className="mc-grid-line" d={`M0,${y(top * f)} H${W}`} />)}
          {last && <path className="mc-area" d={`${line('signedRun')} L${nowX.toFixed(1)},${y(0)} Z`} />}
          {goal ? <path className="mc-line-pace" d={`M0,${y(0)} L${W},${y(goal)}`} /> : null}
          {last && <path className="mc-now" d={`M${nowX.toFixed(1)},0 V${H}`} />}
          <path className="mc-line-collected" d={line('collectedRun')} />
          {projPath && <path className="mc-line-collected" d={projPath} style={{ strokeDasharray: '6 6', opacity: 0.6 }} />}
          <path className="mc-line-signed" d={line('signedRun')} />
        </svg>
        <div className="mc-months" aria-hidden="true">{months.map((m) => <span key={m.label} className={m === last ? 'is-now' : undefined}>{m.label.slice(0, 1)}</span>)}</div>
      </div>
      <ul className="mc-legend">
        <li><span className="mc-key mc-key-signed" aria-hidden="true" />Signed <strong>{format(last?.signedRun ?? 0)}</strong></li>
        <li><span className="mc-key mc-key-collected" aria-hidden="true" />Collected <strong>{format(last?.collectedRun ?? 0)}</strong></li>
        {projectedEnd !== undefined ? <li><span className="mc-key mc-key-collected" aria-hidden="true" style={{ borderTopStyle: 'dashed', opacity: 0.6 }} />Projected <strong>{format(projectedEnd)}</strong> by {projectedTo}</li> : null}
        {goal ? <li><span className="mc-key mc-key-pace" aria-hidden="true" />Even pace <strong>{format(goal * yearGone)}</strong> today</li> : null}
      </ul>
      {children}
    </figure>
  )
}
