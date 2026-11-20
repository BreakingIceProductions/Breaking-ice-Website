import 'server-only'
import Link from 'next/link'
import { portalImage } from './data'
import { accentVars } from './retainer-accent'
import type { Session } from './types'
import { buildMonthView, monthKey, retainerClientsFor } from '@/retainer/data'
import '@/app/css/retainer.css'

export type RetainerCard = { id: string; organizationName: string; logo?: string; accent?: string; done: number; total: number }

/** This month's progress for each retainer client the person is on. Never breaks the home page. */
export async function retainerCardsFor(session: Session): Promise<RetainerCard[]> {
  const clients = await retainerClientsFor(session).catch((e) => {
    console.error('[retainer] clients for home failed', e)
    return []
  })
  const now = monthKey()
  return Promise.all(
    clients.map(async (c) => {
      const v = await buildMonthView(c, now).catch(() => null)
      return {
        id: c._id,
        organizationName: c.organizationName,
        logo: portalImage(c.logo, 120),
        accent: c.retainer.accent,
        done: v?.done ?? 0,
        total: v ? v.perMonth + v.carried : c.retainer.perMonth,
      }
    }),
  )
}

export function RetainerCards({ cards }: { cards: RetainerCard[] }) {
  const multi = cards.length > 1
  return (
    <section aria-labelledby="retainer-h" className="p-home-sec">
      <h2 id="retainer-h" className="p-label">Monthly content</h2>
      <ul className="rt-home-list">
        {cards.map((c) => {
          const pct = c.total > 0 ? Math.min(100, Math.round((c.done / c.total) * 100)) : 0
          return (
            <li key={c.id}>
              <Link className={`rt-home-card${c.logo ? '' : ' no-logo'}`} href={`/portal/retainer/${encodeURIComponent(c.id)}`} style={accentVars(c.accent) as React.CSSProperties}>
                {c.logo && (
                  <span className="rt-home-logo" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.logo} alt="" />
                  </span>
                )}
                <span className="rt-home-body">
                  <span className="rt-home-title">{multi ? c.organizationName : 'Your monthly content'}</span>
                  <span className="muted small">{c.done} of {c.total} done this month</span>
                  <span className="rt-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                </span>
                <span className="rt-home-go" aria-hidden="true">→</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
