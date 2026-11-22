import Link from 'next/link'
import { PendingLink } from '@/admin/ui/pending-link'
import { notFound } from 'next/navigation'
import '../../../../css/retainer-admin.css'
import '../../../../css/admin-pages.css'
import '../../../../css/admin-simple-b.css'
import { fmtDate } from '@/admin/dates'
import { requireAdmin } from '@/admin/auth'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import { MeterRing } from '@/admin/ui/retainer-meter'
import { Chip, HelpTip } from '@/admin/ui/viz'
import { PhoneFold } from '../../_fold'
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

/** Two letters for a network badge; the full name is its label. */
const NET_SHORT: Partial<Record<Network, string>> = { instagram: 'IG', facebook: 'FB', linkedin: 'in', tiktok: 'TT', youtube: 'YT', twitter: 'X', threads: '@', pinterest: 'P', google: 'G', bluesky: 'BS', mastodon: 'M' }

/** One post as a tile: status, day, networks and reach. The caption opens on click. */
function Piece({ p }: { p: PublerPiece }) {
  const m = p.metrics
  const facts = m ? [num(m.reach) && `${num(m.reach)} reach`, num(m.engagement) && `${num(m.engagement)} engagements`, num(m.videoViews) && `${num(m.videoViews)} views`].filter(Boolean) : []
  const big = m?.reach !== undefined ? { n: num(m.reach), what: 'reach' } : m?.videoViews !== undefined ? { n: num(m.videoViews), what: 'views' } : null
  return (
    <li className={`rt-tile rt-tile-${p.state}`}>
      <div className="rt-tile-top">
        <Chip tone={p.state === 'published' ? 'ok' : 'info'}>{p.state === 'published' ? 'Published' : 'Scheduled'}</Chip>
        <time className="rt-tile-day" dateTime={p.at} title={when(p.at)}>{fmtDate(p.at)}</time>
      </div>
      <ul className="rt-nets" aria-label="Networks">
        {p.networks.map((n) => {
          const name = NET[n.network] ?? 'Other'
          return (
            <li key={n.postId}>
              {n.link ? (
                <a className="rt-net" href={n.link} target="_blank" rel="noopener noreferrer" title={name} aria-label={`${name} (opens in a new tab)`}>{NET_SHORT[n.network] ?? '•'}</a>
              ) : (
                <span className="rt-net" title={name} aria-label={name} role="img">{NET_SHORT[n.network] ?? '•'}</span>
              )}
            </li>
          )
        })}
      </ul>
      {big ? (
        <p className="rt-tile-num" title={facts.join(' · ')}>
          {big.n} <span className="rt-tile-unit">{big.what}</span>
          {facts.length > 1 && <span className="sr-only"> · {facts.slice(1).join(' · ')}</span>}
        </p>
      ) : null}
      <details className="rt-caption">
        <summary>Caption</summary>
        <p className="rt-piece-text">{p.text || <span className="muted">(no text)</span>}</p>
        {facts.length > 1 && <p className="small muted">{facts.join(' · ')}</p>}
      </details>
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
    <div className="a-page rt-page" style={accentStyle}>
      <Breadcrumb trail={[{ label: 'Retainers', href: '/admin/retainers' }]} />

      <header className="a-head">
        <div className="stack ap-gap-3 ap-minw0">
          <h1 className="a-h1"><span className="rt-swatch" aria-hidden="true" />{c.organizationName}</h1>
          <div className="row-wrap a-chips">
            {!c.retainer.active && <Chip tone="warm" label="This retainer is switched off. Turn it back on under Retainer settings.">Off</Chip>}
            {!readOnly && (
              <a className="a-chip a-chip-link" href={`/api/admin/view-as?client=${encodeURIComponent(c._id)}&next=${encodeURIComponent(portalPath)}`} target="_blank" rel="noopener noreferrer">
                Preview portal<span className="sr-only"> as the client sees it (opens in a new tab)</span> ↗
              </a>
            )}
            <details className="ld-menu rt-links">
              <summary className="a-chip a-chip-link">More<span className="sr-only"> links for {c.organizationName}</span></summary>
              <ul>
                <li><Link href={`/admin/clients/${encodeURIComponent(c._id)}`}>Client page</Link></li>
                <li><a href={`/studio/portal/structure/client;${encodeURIComponent(c._id)}`} target="_blank" rel="noopener noreferrer">Edit client details<span className="sr-only"> in the editor (opens in a new tab)</span> ↗</a></li>
                {c.driveFolderId && (
                  <li><a href={`https://drive.google.com/drive/folders/${c.driveFolderId}`} target="_blank" rel="noopener noreferrer">Drive folder<span className="sr-only"> (opens in a new tab)</span> ↗</a></li>
                )}
              </ul>
            </details>
          </div>
        </div>
        {c.retainer.active && <MeterRing view={view} />}
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
            <span className="rt-head-side">
              <span className="muted small">{view.pieces.length}</span>
              <HelpTip label="social posts">A post sent to several networks at once counts once. Read only: change posts where you schedule them.</HelpTip>
            </span>
          </div>
          {view.publerNote && <p className="small muted m0" role="note">{view.publerNote}</p>}
          {view.pieces.length ? <ul className="rt-tiles">{view.pieces.map((p) => <Piece key={p.id} p={p} />)}</ul> : <p className="muted a-empty">None this month</p>}
        </section>
      </div>

      {recapBefore ? (
        <p className="small muted m0 row-wrap ap-gap-6px" role="note">
          No recap for {monthLabel(recapMonth)}
          <HelpTip label="recaps">It’s outside this client’s retainer months. The first one is drafted on the 1st after a retainer month ends.</HelpTip>
        </p>
      ) : (
      <PhoneFold
        className="p-card"
        folded
        labelledBy="h-recap"
        summary={
          <>
            <h2 id="h-recap" className="a-h2">Recap: {monthLabel(recapMonth)}</h2>
            <span className="rt-head-side">
              {recapDoc?.recap?.sentAt ? <Chip tone="ok" label={`Sent ${when(recapDoc.recap.sentAt)}`}>Sent</Chip> : recapDoc?.recap?.draftedAt ? <Chip tone="warm" label={`Drafted ${when(recapDoc.recap.draftedAt)}, not sent yet`}>Draft ready</Chip> : <Chip label="No draft yet. It’s written automatically on the 1st.">No draft</Chip>}
              <Chip tone={to.length ? 'muted' : 'warm'} label={to.length ? `Goes to ${to.join(', ')}` : 'No contact on this client gets emails yet'}>{to.length ? `${to.length} ${to.length === 1 ? 'recipient' : 'recipients'}` : 'No recipient'}</Chip>
            </span>
          </>
        }
      >
        <RetainerRecap key={recapMonth} clientId={c._id} month={recapMonth} monthName={monthLabel(recapMonth).split(' ')[0]} recap={recapDoc?.recap} to={to} readOnly={readOnly} />
      </PhoneFold>
      )}

      <details className="p-card ap-details">
        <summary id="h-settings" className="a-h2">Retainer settings</summary>
        <RetainerSettingsForm clientId={c._id} settings={c.retainer} readOnly={readOnly} />
      </details>
    </div>
  )
}
