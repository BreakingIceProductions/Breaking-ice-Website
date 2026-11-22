import '../../../css/admin-pages.css'
import Link from 'next/link'
import '../../../css/retainer-admin.css'
import '../../../css/admin-simple-a.css'
import '../../../css/admin-simple-b.css'
import '../../../css/admin-simple-d.css'
import { requireAdmin } from '@/admin/auth'
import { listClients } from '@/admin/data'
import { allRetainerClients, buildMonthView, monthKey, monthLabel, type RetainerClient } from '@/retainer/data'
import type { RetainerMonthView } from '@/retainer/types'
import { MeterRing } from '@/admin/ui/retainer-meter'

export const metadata = { title: 'Retainers' }

/** Every retainer client and how this month is going. */
export default async function Retainers() {
  await requireAdmin()
  const month = monthKey()
  const [clients, everyone] = await Promise.all([allRetainerClients({ includeInactive: true }), listClients().catch(() => [])])
  const active = clients.filter((c) => c.retainer.active)
  const paused = clients.filter((c) => !c.retainer.active)
  const views = new Map<string, RetainerMonthView | null>(
    await Promise.all(active.map(async (c) => [c._id, await buildMonthView(c, month).catch(() => null)] as const)),
  )
  const without = everyone.filter((c) => !clients.some((r) => r._id === c._id))

  const row = (c: RetainerClient) => {
    const v = views.get(c._id)
    return (
      <li key={c._id} className="sd-rt-row">
        <Link className="a-row-main sd-rt-main" href={`/admin/retainers/${encodeURIComponent(c._id)}`}>
          <strong className="sd-rt-name"><span className="rt-swatch" style={c.retainer.accent ? ({ '--rt-accent': c.retainer.accent } as React.CSSProperties) : undefined} aria-hidden="true" />{c.organizationName}</strong>
          <span className="sa-chips sd-rt-chips">
            <span className="sa-chip">{c.retainer.perMonth} a month</span>
            <span className="sa-chip" title={c.retainer.rollover === 'next-month' ? 'Unused carry over' : 'Starts fresh monthly'}>{c.retainer.rollover === 'next-month' ? 'Carries over' : 'Fresh monthly'}</span>
            <span className={`sa-chip${c.retainer.publerWorkspaceId ? '' : ' sd-chip-quiet'}`}>{c.retainer.publerWorkspaceId ? 'Social linked' : 'No social account'}</span>
          </span>
        </Link>
        <span className="a-row-side sd-rt-side">{c.retainer.active ? (v ? <MeterRing view={v} /> : <span className="muted small">Couldn’t count this month</span>) : <span className="a-stage">Off</span>}</span>
      </li>
    )
  }

  return (
    <div className="a-page">
      <header className="a-head">
        <div className="sd-head-row">
          <h1 className="a-h1 sa-h1">Retainers</h1>
          <span className="sa-chip">{monthLabel(month)}</span>
        </div>
      </header>

      <section className="p-card" aria-labelledby="h-active">
        <div className="a-card-head">
          <h2 id="h-active" className="a-h2">On retainer</h2>
          <span className="muted small">{active.length}</span>
        </div>
        {active.length ? <ul className="a-rows">{active.map(row)}</ul> : <p className="muted a-empty">No retainer clients yet. Open “Set up a retainer” below and pick a client.</p>}
      </section>

      {paused.length > 0 && (
        <section className="p-card" aria-labelledby="h-paused">
          <div className="a-card-head">
            <h2 id="h-paused" className="a-h2">Switched off</h2>
            <span className="muted small">{paused.length}</span>
          </div>
          <ul className="a-rows">{paused.map(row)}</ul>
        </section>
      )}

      {without.length > 0 && (
        <section className="p-card" aria-labelledby="h-setup">
          <details>
            <summary id="h-setup" className="a-h2 ap-pointer">Set up a retainer</summary>
            <p className="muted small">Pick the client, then turn the retainer on and save.</p>
            <ul className="a-rows">
              {without.map((c) => (
                <li key={c._id}>
                  <Link className="a-row-main" href={`/admin/retainers/${encodeURIComponent(c._id)}`}><strong>{c.organizationName}</strong></Link>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  )
}
