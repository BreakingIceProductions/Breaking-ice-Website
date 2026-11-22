import Link from 'next/link'
import { PendingLink } from '@/admin/ui/pending-link'
import { notFound } from 'next/navigation'
import '../../../../css/retainer-admin.css'
import '../../../../css/admin-pages.css'
import { fmtDate } from '@/admin/dates'
import { requireAdmin } from '@/admin/auth'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import { Meter } from '@/admin/ui/retainer-meter'
import { RetainerItems } from '@/admin/ui/retainer-items'
import { RetainerRecap } from '@/admin/ui/retainer-recap'
import { RetainerSettingsForm } from '@/admin/ui/retainer-settings'
import { buildMonthView, getRetainerClient, getRetainerMonth, isMonthKey, monthKey, monthLabel, monthsFor, shiftMonth } from '@/retainer/data'
import { recapRecipients } from '@/retainer/recap'
import type { Network, PublerPiece } from '@/retainer/types'

type Props = { params: Promise<{ clientId: string }>; searchParams: Promise<{ month?: string }> }

export async function generateMetadata({ params }: Props) {
  await requireAdmin()
  const { clientId } = await params
  const c = await getRetainerClient(decodeURIComponent(clientId), { includeInactive: true })
  return { title: c ? `${c.organizationName}: retainer` : 'Retainer' }
}

const NET: Partial<Record<Network, string>> = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', twitter: 'X', threads: 'Threads', pinterest: 'Pinterest', google: 'Google Business', bluesky: 'Bluesky', mastodon: 'Mastodon' }
const when = (iso: string) => fmtDate(iso, 'time')
const num = (n?: number) => (n === undefined ? undefined : n.toLocaleString('en-CA'))

function Piece({ p }: { p: PublerPiece }) {
  const m = p.metrics
  const facts = m ? [num(m.reach) && `${num(m.reach)} reach`, num(m.engagement) && `${num(m.engagement)} engagements`, num(m.videoViews) && `${num(m.videoViews)} views`].filter(Boolean) : []
  return (
    <li>
      <div className="rt-piece">
        <p className="rt-piece-text">{p.text.length > 220 ? `${p.text.slice(0, 220)}…` : p.text || <span className="muted">(no text)</span>}</p>
        <span className="small muted row-wrap ap-gap-6px">
          <span className={`rt-tag rt-tag-${p.state}`}>{p.state === 'published' ? 'Published' : 'Scheduled'}</span>
          <time dateTime={p.at}>{when(p.at)}</time>
          <span>·</span>
          {p.networks.map((n, i) => (
            <span key={n.postId}>
              {n.link ? <a className="text-link-plain" href={n.link} target="_blank" rel="noopener noreferrer">{NET[n.network] ?? 'Other'}<span className="sr-only"> (opens in a new tab)</span></a> : (NET[n.network] ?? 'Other')}
              {i < p.networks.length - 1 ? ',' : ''}
            </span>
          ))}
          {facts.length ? <span>· {facts.join(' · ')}</span> : null}
        </span>
      </div>
    </li>
  )
}

/** One retainer client: a month at a time (items and social posts), the month-end recap, then the settings folded away. */
export default async function RetainerClientPage({ params, searchParams }: Props) {
  const admin = await requireAdmin()
  const { clientId: raw } = await params
  const c = await getRetainerClient(decodeURIComponent(raw), { includeInactive: true })
  if (!c) notFound()
  const readOnly = Boolean(admin.viewOnly)
  const now = monthKey()
  const months = monthsFor(c)
  const asked = (await searchParams).month
  const month = isMonthKey(asked) && asked <= now ? asked : months[0] ?? now
  // The recap is for a month that has ended: the one picked, or last month.
  const recapMonth = month < now ? month : shiftMonth(now, -1)
  // No recap for months before the retainer began (or after it ended).
  const recapBefore = Boolean(c.retainer.startMonth && recapMonth < c.retainer.startMonth) || Boolean(c.retainer.endMonth && recapMonth > c.retainer.endMonth)
  const [view, recapDoc] = await Promise.all([buildMonthView(c, month), getRetainerMonth(c._id, recapMonth)])
  const to = recapRecipients(c).map((x) => x.email)
  const shownMonths = months.includes(month) ? months : [month, ...months]
  const accentStyle = c.retainer.accent ? ({ '--rt-accent': c.retainer.accent } as React.CSSProperties) : undefined
  const portalPath = `/portal/retainer/${encodeURIComponent(c._id)}`

  return (
    <div className="a-page" style={accentStyle}>
      <Breadcrumb trail={[{ label: 'Retainers', href: '/admin/retainers' }]} />

      <header className="a-head">
        <div className="stack ap-gap-3 ap-minw0">
          <h1 className="a-h1"><span className="rt-swatch" aria-hidden="true" />{c.organizationName}</h1>
          {!c.retainer.active && <p className="ap-note">This retainer is switched off. Turn it back on under Retainer settings.</p>}
          <div className="row-wrap a-chips">
            {!readOnly && (
              <a className="a-chip a-chip-link" href={`/api/admin/view-as?client=${encodeURIComponent(c._id)}&next=${encodeURIComponent(portalPath)}`} target="_blank" rel="noopener noreferrer">
                Preview portal<span className="sr-only"> as the client sees it (opens in a new tab)</span> ↗
              </a>
            )}
            <Link className="a-chip a-chip-link" href={`/admin/clients/${encodeURIComponent(c._id)}`}>Client page</Link>
            <a className="a-chip a-chip-link" href={`/studio/portal/structure/client;${encodeURIComponent(c._id)}`} target="_blank" rel="noopener noreferrer">Edit client details<span className="sr-only"> in the editor (opens in a new tab)</span> ↗</a>
            {c.driveFolderId && (
              <a className="a-chip a-chip-link" href={`https://drive.google.com/drive/folders/${c.driveFolderId}`} target="_blank" rel="noopener noreferrer">Drive folder<span className="sr-only"> (opens in a new tab)</span> ↗</a>
            )}
          </div>
        </div>
        {c.retainer.active && (
          <span className="stack ap-gap-1">
            <span className="small muted">{monthLabel(month)}</span>
            <Meter view={view} accent={c.retainer.accent} />
          </span>
        )}
      </header>

      <nav aria-label="Month">
        <ul className="rt-months">
          {shownMonths.map((m) => (
            <li key={m}>
              <PendingLink href={`/admin/retainers/${encodeURIComponent(c._id)}?month=${m}`} aria-current={m === month ? 'page' : undefined} scroll={false}>{monthLabel(m)}</PendingLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="a-grid-2 ap-grid-top">
        <section className="p-card" aria-labelledby="h-items">
          <div className="a-card-head">
            <h2 id="h-items" className="a-h2">Items · {view.items.filter((i) => i.status === 'delivered').length} delivered</h2>
          </div>
          <RetainerItems key={month} clientId={c._id} month={month} items={view.items} readOnly={readOnly} />
        </section>

        <section className="p-card" aria-labelledby="h-pieces">
          <div className="a-card-head">
            <h2 id="h-pieces" className="a-h2">Social posts</h2>
            <span className="muted small">{view.pieces.length} {view.pieces.length === 1 ? 'post' : 'posts'}</span>
          </div>
          {view.publerNote && <p className="small muted m0" role="note">{view.publerNote}</p>}
          {view.pieces.length ? <ul className="a-rows">{view.pieces.map((p) => <Piece key={p.id} p={p} />)}</ul> : <p className="muted a-empty">No social posts scheduled or published this month.</p>}
          <p className="small muted m0">A post sent to several networks at once counts once. Read only: change posts where you schedule them.</p>
        </section>
      </div>

      {recapBefore ? (
        <p className="small muted m0" role="note">No recap for {monthLabel(recapMonth)}: it’s outside this client’s retainer months. The first one is drafted on the 1st after a retainer month ends.</p>
      ) : (
      <section className="p-card" aria-labelledby="h-recap">
        <div className="a-card-head">
          <h2 id="h-recap" className="a-h2">Recap: {monthLabel(recapMonth)}</h2>
          <span className="muted small">{to.length ? `Goes to ${to.length} ${to.length === 1 ? 'person' : 'people'}` : 'Nobody gets emails yet'}</span>
        </div>
        <RetainerRecap key={recapMonth} clientId={c._id} month={recapMonth} monthName={monthLabel(recapMonth).split(' ')[0]} recap={recapDoc?.recap} to={to} readOnly={readOnly} />
      </section>
      )}

      <details className="p-card ap-details">
        <summary id="h-settings" className="a-h2">Retainer settings</summary>
        <RetainerSettingsForm clientId={c._id} settings={c.retainer} readOnly={readOnly} />
      </details>
    </div>
  )
}
