'use client'

import { useState } from 'react'
import { ColChart } from './viz'

/**
 * The Money tab's "Collected by month" card: this year's columns beside last year's, with a toggle that
 * puts either year in front. Figures arrive as text (this is a client component, so no formatter is passed).
 * `projected` adds this year's recurring invoices still to come as hatched columns on future months: projected,
 * not collected, and said so in the legend line, the hover text and the chart's description.
 */
export function YearCols({
  months,
  years,
  projected,
}: {
  months: { label: string; future: boolean; current: boolean }[]
  years: { year: string; values: number[]; texts: string[]; total: string }[]
  projected?: { values: number[]; texts: string[]; total: string }
}) {
  const [pick, setPick] = useState(0)
  const front = years[pick]
  const back = years.length > 1 ? years[1 - pick] : undefined
  const isNow = pick === 0
  const proj = isNow && projected && months.some((m, i) => m.future && projected.values[i] > 0) ? projected : undefined
  const projText = proj ? months.map((m, i) => (m.future && proj.values[i] > 0 ? `${m.label} ${proj.texts[i]}` : null)).filter(Boolean).join(', ') : ''
  return (
    <>
      <div className="sb-card-head">
        <div className="mc-head">
          <h2 id="mn-months-h" className="a-h2">Collected by month, {front.year}</h2>
          <p className="mc-sub">
            {years.map((y) => `${y.total} in ${y.year}`).join(' · ')}
            {proj ? ` · ${proj.total} projected` : ''}
          </p>
        </div>
        {back && (
          <div className="mc-toggle" role="group" aria-label="Year in front">
            {years.map((y, i) => (
              <button key={y.year} type="button" aria-pressed={pick === i} onClick={() => setPick(i)}>{y.year}</button>
            ))}
          </div>
        )}
      </div>
      <ColChart
        label={`Collected by month in ${front.year}: ${months.map((m, i) => (isNow && m.future ? null : `${m.label} ${front.texts[i]}`)).filter(Boolean).join(', ')}${back ? `. ${back.year}: ${months.map((m, i) => (!isNow || !m.future ? `${m.label} ${back.texts[i]}` : null)).filter(Boolean).join(', ')}` : ''}${proj ? `. Projected from recurring invoices, not collected yet: ${projText}` : ''}.`}
        legend={back ? [front.year, back.year] : undefined}
        cols={months.map((m, i) => ({
          label: m.label,
          short: m.label.slice(0, 3),
          value: front.values[i],
          value2: back?.values[i],
          future: isNow && m.future,
          current: isNow && m.current,
          projected: proj && m.future ? proj.values[i] : undefined,
          title:
            isNow && m.future
              ? proj && proj.values[i] > 0
                ? `${m.label}: ${proj.texts[i]} projected from recurring invoices (not collected yet)`
                : `${m.label}: still to come`
              : `${m.label} ${front.year}: ${front.texts[i]}${back ? ` · ${back.year}: ${back.texts[i]}` : ''}`,
        }))}
      />
      {proj && <p className="mc-key-line">Hatched: recurring invoices Zoho Books will make, before GST. Projected, not collected.</p>}
    </>
  )
}
