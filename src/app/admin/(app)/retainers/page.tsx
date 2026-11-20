import Link from 'next/link'
import '../../../css/retainer-admin.css'
import { requireAdmin } from '@/admin/auth'
import { listClients } from '@/admin/data'
import { allRetainerClients, buildMonthView, monthKey, monthLabel, type RetainerClient } from '@/retainer/data'
import type { RetainerMonthView } from '@/retainer/types'
import { Meter } from '@/admin/ui/retainer-meter'

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
      <li key={c._id}>
        <Link className="a-row-main" href={`/admin/retainers/${encodeURIComponent(c._id)}`}>
          <strong><span className="rt-swatch" style={c.retainer.accent ? ({ '--rt-accent': c.retainer.accent } as React.CSSProperties) : undefined} aria-hidden="true" />{c.organizationName}</strong>
          <span className="muted small">
            {[`${c.retainer.perMonth} a month`, c.retainer.rollover === 'next-month' ? 'unused carry over' : 'starts fresh monthly', c.retainer.publerWorkspaceId ? 'Publer connected' : 'no Publer workspace'].join(' · ')}
          </span>
        </Link>
        <span className="a-row-side">{c.retainer.active ? (v ? <Meter view={v} accent={c.retainer.accent} /> : <span className="muted small">Couldn’t count this month</span>) : <span className="a-stage">Off</span>}</span>
      </li>
    )
  }

  return (
    <div className="a-page">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <h1 className="a-h1">Retainers</h1>
          <p className="muted" style={{ margin: 0 }}>Monthly clients: what’s done in {monthLabel(month)}, from Publer and what you’ve delivered.</p>
        </div>
      </header>

      <section className="p-card" aria-labelledby="h-active">
        <div className="a-card-head">
          <h2 id="h-active" className="a-h2">On retainer</h2>
          <span className="muted small">{active.length}</span>
        </div>
        {active.length ? <ul className="a-rows">{active.map(row)}</ul> : <p className="muted a-empty">No retainer clients yet. Set one up below.</p>}
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
            <summary id="h-setup" className="a-h2" style={{ cursor: 'pointer' }}>Set up a retainer</summary>
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
