import type { ReactNode } from 'react'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'
import { Segments } from './graphics'
import { Chip, type ChipTone } from './viz'

/**
 * Calm-card helpers for the second simplification pass (Pipeline, All projects, Lead, People, Clients):
 * a stage chip and a mini stage bar, a days-in-stage chip that turns copper when a lead goes cold, and a
 * timeline with dots. No hooks, so server and client pages can both use them. Styles: `.sc-` in
 * admin-simple-c.css (the chips themselves come from admin-simple-b.css, the bar from admin-simple-a.css).
 */

const STAGES = PIPELINE_STAGES as readonly { title: string; value: string; group: string }[]
const at = (stage: string) => STAGES.findIndex((s) => s.value === stage)

/** Sales stages are blue, production copper, finished (Final delivery, Paid) green. */
export function stageTone(stage: string): ChipTone {
  const i = at(stage)
  if (i < 0) return 'muted'
  if (STAGES[i].group === 'sales') return 'info'
  return i >= at('delivered') ? 'ok' : 'warm'
}

/** A stage as a coloured chip. `title` defaults to the stage's own name. */
export function StageChip({ stage, title, children }: { stage: string; title?: string; children?: ReactNode }) {
  const name = title ?? STAGES[at(stage)]?.title ?? stage
  return <Chip tone={stageTone(stage)} label={`Stage: ${name}`}>{children ?? name}</Chip>
}

/** Where a project is among all eleven stages, as a thin bar with the stage name beside it. */
export function MiniStage({ stage, archived, declined }: { stage: string; archived?: boolean; declined?: boolean }) {
  const i = at(stage)
  const name = STAGES[i]?.title ?? stage
  const extra = declined ? 'Declined' : archived ? 'Archived' : ''
  return (
    <span className="sc-ministage">
      <Segments total={STAGES.length} done={i} current={i} label={`Stage ${i + 1} of ${STAGES.length}: ${name}${extra ? `, ${extra.toLowerCase()}` : ''}`} />
      <span className="sc-ministage-name" aria-hidden="true">{extra ? `${extra} · ` : ''}{name}</span>
    </span>
  )
}

/** Days in the current stage, copper when the lead is going cold. */
export function DaysChip({ days, cold }: { days: number | null; cold?: boolean }) {
  if (days == null) return null
  const text = days <= 0 ? 'Today' : `${days}d`
  const long = `${days <= 0 ? 'Moved here today' : `${days} day${days === 1 ? '' : 's'} in this stage`}${cold ? ', going cold' : ''}`
  return (
    <span className={`sc-days${cold ? ' is-cold' : ''}`} title={long} role="img" aria-label={long}>
      {cold && <span className="sc-days-flame" aria-hidden="true">●</span>}
      {text}
    </span>
  )
}

export type TimelineItem = { key: string; text: ReactNode; sub?: ReactNode; when?: ReactNode; dateTime?: string; /** Your own note, shown in italics with a hollow dot. */ note?: boolean }

/** Events down a thin line, newest first, a dot for each. */
export function Timeline({ items, label }: { items: TimelineItem[]; label?: string }) {
  return (
    <ol className="sc-timeline" aria-label={label}>
      {items.map((it) => (
        <li key={it.key} className={it.note ? 'is-note' : undefined}>
          <span className="sc-tl-dot" aria-hidden="true" />
          <span className="sc-tl-text">
            <span className={it.note ? 'a-note' : undefined}>{it.text}</span>
            {it.sub && <span className="sc-tl-sub">{it.sub}</span>}
          </span>
          {it.when && (it.dateTime ? <time className="sc-tl-when" dateTime={it.dateTime}>{it.when}</time> : <span className="sc-tl-when">{it.when}</span>)}
        </li>
      ))}
    </ol>
  )
}
