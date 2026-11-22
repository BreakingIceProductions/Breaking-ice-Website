import { monthKey, monthLabel } from '@/retainer/data'
import type { RetainerMonthView } from '@/retainer/types'
import { GoalRing } from './viz'

/**
 * "9 of 10 delivered this month (7 posts, 2 items)", with last month's carry-over when there is one.
 * Server only (it reads the month helpers).
 */
export function Meter({ view, accent }: { view: RetainerMonthView; accent?: string }) {
  const of = view.perMonth + view.carried
  const pct = of ? Math.min(100, Math.round((view.done / of) * 100)) : 0
  const posts = view.pieces.length
  const items = Math.max(0, view.done - posts)
  const when = view.month === monthKey() ? 'this month' : `in ${monthLabel(view.month)}`
  const parts = [posts ? `${posts} post${posts === 1 ? '' : 's'}` : '', items ? `${items} item${items === 1 ? '' : 's'}` : '', view.carried ? `${view.carried} carried` : ''].filter(Boolean)
  return (
    <span className="rt-meter" style={accent ? ({ '--rt-accent': accent } as React.CSSProperties) : undefined}>
      <span className="rt-meter-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      <span className="rt-meter-num">
        {view.done} of {of} delivered {when}{parts.length ? <span className="muted small"> ({parts.join(', ')})</span> : null}
      </span>
    </span>
  )
}

/** The same count as a ring: "9/10" in the middle, the month and the split in its label. For the client page header. */
export function MeterRing({ view }: { view: RetainerMonthView }) {
  const of = view.perMonth + view.carried
  const posts = view.pieces.length
  const items = Math.max(0, view.done - posts)
  const when = view.month === monthKey() ? 'this month' : `in ${monthLabel(view.month)}`
  const parts = [posts ? `${posts} post${posts === 1 ? '' : 's'}` : '', items ? `${items} item${items === 1 ? '' : 's'}` : '', view.carried ? `${view.carried} carried` : ''].filter(Boolean)
  return (
    <span className="rt-ring">
      <GoalRing share={of ? view.done / of : 0} size={72} label={`${view.done} of ${of} delivered ${when}${parts.length ? ` (${parts.join(', ')})` : ''}`}>
        {view.done}/{of}
      </GoalRing>
      <span className="rt-ring-cap" aria-hidden="true">delivered</span>
    </span>
  )
}
