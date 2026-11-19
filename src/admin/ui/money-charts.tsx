import type { ReactNode } from 'react'

/**
 * The Money page's charts, built from plain HTML and one inline SVG. Every bar has its label and
 * number written beside it, so the chart is also its own text version; the two-series charts
 * tell their series apart by a solid fill against a striped one, not by colour alone.
 */

const share = (value: number, max: number) => `${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}%`

export type BarRow = { label: string; value: number; text: string; note?: string }

/** One bar a row, longest first or in the order given. */
export function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0)
  if (!rows.length || max <= 0) return <p className="muted small mn-empty">{empty}</p>
  return (
    <ul className="mn-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="mn-bar-label">{r.label}</span>
          <span className="mn-bar-num">{r.text}</span>
          <span className="mn-track" aria-hidden="true"><span className="mn-fill" style={{ width: share(r.value, max) }} /></span>
          {r.note && <span className="mn-bar-note">{r.note}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Two bars a row on one scale: the first series solid, the second striped. */
export function PairBars({ rows, a, b, format, empty }: { rows: { label: string; a: number; b: number; /** Shown in place of the first number, e.g. a dash for a month still to come. */ aText?: string }[]; a: string; b: string; format: (n: number) => string; empty: string }) {
  const max = Math.max(...rows.flatMap((r) => [r.a, r.b]), 0)
  if (!rows.length || max <= 0) return <p className="muted small mn-empty">{empty}</p>
  return (
    <div className="stack mn-pairs-wrap">
      <ul className="mn-legend" aria-hidden="true">
        <li><span className="mn-key mn-fill" />{a}</li>
        <li><span className="mn-key mn-fill mn-alt" />{b}</li>
      </ul>
      <ul className="mn-pairs">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="mn-bar-label">{r.label}</span>
            <span className="mn-pair">
              <span className="mn-track" aria-hidden="true"><span className="mn-fill" style={{ width: share(r.a, max) }} /></span>
              <span className="mn-bar-num"><span className="sr-only">{a}: </span>{r.aText ?? format(r.a)}</span>
              <span className="mn-track" aria-hidden="true"><span className="mn-fill mn-alt" style={{ width: share(r.b, max) }} /></span>
              <span className="mn-bar-num"><span className="sr-only">{b}: </span>{format(r.b)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A value against a goal: the bar fills to the value, and a tick marks where an even pace (or the goal itself) sits. */
export function Meter({ value, tick, tickLabel }: { value: number; tick?: number; tickLabel?: string }) {
  return (
    <span className="mn-meter" aria-hidden="true">
      <span className="mn-track"><span className="mn-fill" style={{ width: share(value, 1) }} /></span>
      {tick !== undefined && <span className="mn-tick" style={{ left: share(tick, 1) }} title={tickLabel} />}
    </span>
  )
}

/** One project's quote total in three parts: paid, billed but not paid, and left to bill. */
export function SplitBar({ paid, billed, left }: { paid: number; billed: number; left: number }) {
  const total = paid + billed + left
  return (
    <span className="mn-split" aria-hidden="true">
      {paid > 0 && <span className="mn-split-paid" style={{ flexGrow: paid / total }} />}
      {billed > 0 && <span className="mn-split-billed" style={{ flexGrow: billed / total }} />}
      {left > 0 && <span className="mn-split-left" style={{ flexGrow: left / total }} />}
    </span>
  )
}

export type YearMonth = { label: string; future: boolean; signedRun: number; collectedRun: number; pace?: number }

/**
 * Running totals through the year. Each finished month is plotted at its end and the current month at
 * today, so the lines stop where the year has got to. The dotted line is an even pace to the signed goal.
 */
export function YearLines({ months, goal, yearGone, format, children }: { months: YearMonth[]; goal?: number; yearGone: number; format: (n: number) => string; children?: ReactNode }) {
  const W = 720
  const H = 220
  const PAD = 12
  const done = months.filter((m) => !m.future)
  const last = done.at(-1)
  const top = Math.max(goal ?? 0, last?.signedRun ?? 0, last?.collectedRun ?? 0, 1)
  const x = (i: number) => (i === done.length - 1 ? yearGone : (i + 1) / 12) * W
  const y = (v: number) => H - PAD - (v / top) * (H - PAD * 2)
  const path = (key: 'signedRun' | 'collectedRun') => `M0,${y(0)} ${done.map((m, i) => `L${x(i).toFixed(1)},${y(m[key]).toFixed(1)}`).join(' ')}`
  const summary = last
    ? `Running totals to today: ${format(last.signedRun)} signed, ${format(last.collectedRun)} collected${goal ? `, against an even pace of ${format(goal * yearGone)} toward a ${format(goal)} signed goal` : ''}.`
    : 'Nothing recorded yet this year.'
  return (
    <figure className="mn-year">
      <ul className="mn-legend">
        <li><svg width="28" height="10" aria-hidden="true"><path className="mn-line-signed" d="M0,5 H28" /><circle className="mn-dot-signed" cx="14" cy="5" r="3.5" /></svg>Signed{last ? ` · ${format(last.signedRun)}` : ''}</li>
        <li><svg width="28" height="10" aria-hidden="true"><path className="mn-line-collected" d="M0,5 H28" /><rect className="mn-dot-collected" x="10.5" y="1.5" width="7" height="7" /></svg>Collected{last ? ` · ${format(last.collectedRun)}` : ''}</li>
        {goal ? <li><svg width="28" height="10" aria-hidden="true"><path className="mn-line-pace" d="M0,5 H28" /></svg>Even pace to the signed goal · {format(goal * yearGone)} by today</li> : null}
      </ul>
      <div className="mn-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
          {[0, 0.5, 1].map((f) => <path key={f} className="mn-grid-line" d={`M0,${y(top * f)} H${W}`} />)}
          {goal ? <path className="mn-line-pace" d={`M0,${y(0)} L${W},${y(goal)}`} /> : null}
          <path className="mn-line-collected" d={path('collectedRun')} />
          <path className="mn-line-signed" d={path('signedRun')} />
          {done.map((m, i) => (
            <g key={m.label}>
              <rect className="mn-dot-collected" x={x(i) - 4} y={y(m.collectedRun) - 4} width="8" height="8"><title>{`${m.label}: ${format(m.collectedRun)} collected so far`}</title></rect>
              <circle className="mn-dot-signed" cx={x(i)} cy={y(m.signedRun)} r="4.5"><title>{`${m.label}: ${format(m.signedRun)} signed so far`}</title></circle>
            </g>
          ))}
        </svg>
        <div className="mn-months" aria-hidden="true">{months.map((m) => <span key={m.label}>{m.label}</span>)}</div>
      </div>
      <figcaption className="small muted">Scale: $0 to {format(top)}. {summary}</figcaption>
      {children}
    </figure>
  )
}
