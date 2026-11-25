import { notFound } from 'next/navigation'
import { requireAccess } from '@/portal/current'
import { PaymentList } from '@/portal/payment-list'
import { portalImage } from '@/portal/data'
import { accentVars } from '@/portal/retainer-accent'
import { resolveBrand } from '@/portal/retainer-brand'
import { brandFontClass } from '@/portal/retainer-fonts'
import { Analytics, FileRows, ItemList, MonthSwitcher, PieceList, Progress, Schedule } from '@/portal/retainer-ui'
import type { DriveFile } from '@/portal/types'
import {
  buildMonthView,
  monthKey,
  monthLabel,
  monthsFor,
  retainerClientsFor,
  retainerDocuments,
  retainerLibrary,
  shiftMonth,
  upcomingPieces,
  type RetainerClient,
} from '@/retainer/data'
import type { MonthKey } from '@/retainer/types'
import '@/app/css/retainer.css'

type Props = { params: Promise<{ clientId: string }>; searchParams: Promise<{ m?: string | string[]; pay?: string }> }

/** Only a contact on this retainer client (or the back office previewing it) gets past here. */
async function clientFor(clientId: string): Promise<RetainerClient> {
  const { session } = await requireAccess()
  const c = (await retainerClientsFor(session)).find((x) => x._id === clientId)
  if (!c) notFound()
  return c
}

export async function generateMetadata({ params }: Props) {
  const { clientId } = await params
  const { session } = await requireAccess()
  const c = (await retainerClientsFor(session).catch(() => [])).find((x) => x._id === clientId)
  return { title: c ? `${c.retainer.brand?.displayName || c.organizationName} · monthly content` : 'Monthly content' }
}

export default async function RetainerPage({ params, searchParams }: Props) {
  const { clientId } = await params
  const c = await clientFor(clientId)
  const { m, pay: payNote } = await searchParams
  // Monthly invoices from Zoho Books, newest first. The same list the pay route checks, so only this client's own.
  const billing = (await requireAccess()).payments.filter((p) => p.kind === 'retainer' && p.clientId === c._id).reverse()

  const now = monthKey()
  const months = [...new Set(monthsFor(c))].sort()
  const asked = typeof m === 'string' && /^\d{4}-\d{2}$/.test(m) && months.includes(m) ? m : undefined
  const month: MonthKey = asked ?? (months.includes(now) ? now : months[months.length - 1] ?? now)
  const current = month === now
  const label = monthLabel(month)
  const base = `/portal/retainer/${encodeURIComponent(c._id)}`

  const [view, upcoming, library, documents] = await Promise.all([
    buildMonthView(c, month),
    upcomingPieces(c).catch(() => ({ pieces: [], note: 'We couldn’t load the posting schedule just now.' })),
    retainerLibrary(c).catch(() => null),
    retainerDocuments(c).catch(() => null),
  ])

  const brand = resolveBrand(c)
  const logo = brand ? undefined : portalImage(c.logo, 240)
  const total = view.perMonth + view.carried
  const open = view.items.filter((it) => it.status !== 'delivered')
  const toCome = Math.max(0, total - view.done)
  const pieces = [...view.pieces].sort((a, b) => a.at.localeCompare(b.at))
  const items = view.items
  const byMonth = groupByMonth(library ?? [])

  const progress = <Progress done={view.done} perMonth={view.perMonth} carried={view.carried} carriedFrom={monthName(shiftMonth(month, -1))} current={current} label={label} />
  /** Small uppercase label above a section heading: brand pages only. */
  const eb = (text: string) => (brand ? <span className="nb-eyebrow" aria-hidden="true">{text}</span> : null)

  const body = (
    <div className={`wrap rt-page${brand ? ' nb-body' : ''}`} style={brand ? undefined : (accentVars(c.retainer.accent) as React.CSSProperties)}>
      {!brand && (
        <header className="rt-head">
          {logo && (
            <span className="rt-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt={`${c.organizationName} logo`} />
            </span>
          )}
          <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
            <span className="eyebrow">Monthly content</span>
            <h1 className="h1 rt-h1">{c.organizationName}<span className="rt-with">, with Breaking Ice</span></h1>
          </div>
        </header>
      )}

      <section className="rt-card rt-month-card" aria-labelledby="rt-month-h">
        <div className="rt-month-top">
          <div className="nb-head">
            {eb('Deliverables')}
            <h2 id="rt-month-h" className="p-label">{current ? 'This month' : label}</h2>
          </div>
          <MonthSwitcher base={base} month={month} months={months.map((k) => ({ key: k, label: monthLabel(k) }))} label={monthLabel} />
        </div>
        {!brand && progress}

        {items.length + pieces.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nothing is listed for {label} yet.</p>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-8)' }}>
            {items.length > 0 && (
              <div className="stack" style={{ gap: 'var(--space-3)' }}>
                <h3 className="rt-sub">Videos, photos and design</h3>
                <ItemList items={items} clientId={c._id} />
              </div>
            )}
            {pieces.length > 0 && (
              <div className="stack" style={{ gap: 'var(--space-3)' }}>
                <h3 className="rt-sub">Social posts</h3>
                <PieceList pieces={pieces} />
              </div>
            )}
          </div>
        )}
      </section>

      {current && (
        <section className="rt-sec" aria-labelledby="rt-out-h">
          <div className="nb-head">
            {eb('Open items')}
            <h2 id="rt-out-h" className="p-label">Still to come this month</h2>
          </div>
          {toCome === 0 && !open.length ? (
            <p style={{ margin: 0 }}>Everything for {label} is done or scheduled.</p>
          ) : (
            <>
              {toCome > 0 && <p className="rt-big">{toCome} more to come</p>}
              {open.length > 0 && (
                <ul className="rt-out">
                  {open.map((it) => (
                    <li key={it._key}>
                      <span>{it.title}</span>
                      <span className={`pill rt-pill rt-pill-${it.status}`}>{it.status === 'planned' ? 'Planned' : it.status === 'scheduled' ? 'Scheduled' : 'In progress'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <section className="rt-sec" aria-labelledby="rt-sched-h">
        <div className="nb-head">
          {eb('Coming up')}
          <h2 id="rt-sched-h" className="p-label">Posting schedule</h2>
        </div>
        {upcoming.pieces.length ? (
          <Schedule pieces={upcoming.pieces} />
        ) : (
          <p className="muted" style={{ margin: 0 }}>No posts are scheduled in the next few weeks yet.</p>
        )}
        {upcoming.note && <p className="rt-note">{upcoming.note}</p>}
      </section>

      <section className="rt-sec" aria-labelledby="rt-stats-h">
        <div className="nb-head">
          {eb('Results')}
          <h2 id="rt-stats-h" className="p-label">How {current ? 'this month’s' : `${label}`} posts did</h2>
        </div>
        <Analytics pieces={view.pieces} label={label} />
        {view.publerNote && <p className="rt-note">{view.publerNote}</p>}
      </section>

      <section className="rt-sec" aria-labelledby="rt-lib-h">
        <div className="nb-head">
          {eb('Files')}
          <h2 id="rt-lib-h" className="p-label">Library</h2>
        </div>
        {library === null ? (
          <p className="muted" style={{ margin: 0 }}>We couldn’t load your files just now. Try again in a minute.</p>
        ) : !library.length ? (
          <p className="muted" style={{ margin: 0 }}>Files we hand over show up here, month by month.</p>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-8)' }}>
            {byMonth.map((g) => (
              <div key={g.key} className="stack" style={{ gap: 'var(--space-2)' }}>
                <h3 className="rt-sub">{g.key === 'other' ? 'Other files' : monthLabel(g.key)}</h3>
                <FileRows files={g.files} clientId={c._id} />
              </div>
            ))}
          </div>
        )}
      </section>

      {billing.length > 0 && (
        <div className="rt-sec">
          <PaymentList id="billing" heading="Billing" payments={billing} back={base} note={typeof payNote === 'string' ? payNote : undefined} />
        </div>
      )}

      <section className="rt-sec" aria-labelledby="rt-docs-h">
        <div className="nb-head">
          {eb('Paperwork')}
          <h2 id="rt-docs-h" className="p-label">Documents</h2>
        </div>
        {documents === null ? (
          <p className="muted" style={{ margin: 0 }}>We couldn’t load your documents just now. Try again in a minute.</p>
        ) : documents.length ? (
          <FileRows files={documents} clientId={c._id} />
        ) : (
          <p className="muted" style={{ margin: 0 }}>Your retainer agreement will show up here.</p>
        )}
      </section>

      <footer className="rt-foot-row">
        <p className="muted rt-foot">Something not right with a post? Just reply to any of our emails.</p>
        {brand && <p className="nb-credit">Content by Breaking Ice Productions</p>}
      </footer>
    </div>
  )

  if (!brand) return body

  // The client's own world: their tokens on the wrapper, the hero band in their brand surface and pattern.
  const vars = { ...brand.vars, ...(brand.pattern ? { '--nb-pattern': `url("${brand.pattern}")` } : {}) }
  return (
    <div className={`rt-brand ${brandFontClass(brand.fonts)}`.trim()} style={vars as React.CSSProperties}>
      <header className={`nb-hero${brand.pattern ? ' has-pattern' : ''}`}>
        <div className="wrap nb-hero-in">
          <div className="nb-lockup">
            {brand.mark && (
              <span className="nb-mark">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.mark} alt="" width={96} height={96} />
              </span>
            )}
            <div className="nb-words">
              <h1 className="nb-wordmark">{brand.name}<span className="sr-only">: monthly content</span></h1>
              <span className="nb-descriptor" aria-hidden="true">Monthly content</span>
            </div>
          </div>
          <div className="nb-panel">
            <span className="nb-panel-eb">{current ? `This month · ${label}` : label}</span>
            {progress}
          </div>
        </div>
      </header>
      {body}
    </div>
  )
}

/** "October", for "10 + 2 carried from October". */
function monthName(m: MonthKey) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('en-CA', { month: 'long', timeZone: 'UTC' })
}

function groupByMonth(files: (DriveFile & { month?: MonthKey })[]) {
  const map = new Map<string, DriveFile[]>()
  for (const f of files) {
    const k = f.month ?? 'other'
    map.set(k, [...(map.get(k) ?? []), f])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === 'other' ? 1 : b === 'other' ? -1 : b.localeCompare(a)))
    .map(([key, list]) => ({ key, files: list.sort((x, y) => (y.modifiedTime ?? '').localeCompare(x.modifiedTime ?? '')) }))
}
