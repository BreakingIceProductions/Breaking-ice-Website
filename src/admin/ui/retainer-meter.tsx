import type { RetainerMonthView } from '@/retainer/types'

/** "6 of 10 done", with last month's carry-over when there is one. */
export function Meter({ view, accent }: { view: RetainerMonthView; accent?: string }) {
  const of = view.perMonth + view.carried
  const pct = of ? Math.min(100, Math.round((view.done / of) * 100)) : 0
  return (
    <span className="rt-meter" style={accent ? ({ '--rt-accent': accent } as React.CSSProperties) : undefined}>
      <span className="rt-meter-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      <span className="rt-meter-num">
        {view.done} of {of} done{view.carried ? <span className="muted small"> ({view.carried} carried)</span> : null}
      </span>
    </span>
  )
}
