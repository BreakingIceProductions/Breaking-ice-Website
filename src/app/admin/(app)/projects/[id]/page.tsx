import { requireAdmin } from '@/admin/auth'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { checklist, quoteStatus } from '@/admin/board-data'
import { getProject } from '@/admin/data'
import { fmtDay, fmtRange, today, TZ, ymd } from '@/admin/dates'
import { cad } from '@/admin/insights'
import { isContactLog, isSalesStage } from '@/admin/lead'
import { MILESTONE_LIST } from '@/admin/milestones'
import { nextStage, stageIndex, stageTitle } from '@/admin/stages'
import type { OfficeProject } from '@/admin/types'
import { SplitBar } from '@/admin/ui/graphics'
import { LeadActivity, type LeadLogEntry } from '@/admin/ui/lead'
import { NoteForm } from '@/admin/ui/note-form'
import { PaymentsCard } from '@/admin/ui/payments-card'
import { CopyButton, NextUp, ProjectMenu, ProjectProgress, StageChecklist, StageStrip, type MenuLink } from '@/admin/ui/project'
import { QuoteCard } from '@/admin/ui/quote-card'
import { ReviewEmail } from '@/admin/ui/review-email'
import { StageControl } from '@/admin/ui/stage-control'
import { SyncButton } from '@/admin/ui/sync-button'
import { invoiceUrl, zohoConnection } from '@/admin/zoho'
import { SITE_URL } from '@/lib/site'
import { stripeReady } from '@/portal/config'
import { getPortalSettings } from '@/portal/data'
import { categoryOf, isLatest, versionLabel, versionPath } from '@/portal/library'
import { paymentsForProject, stripeTestMode } from '@/portal/payments'
import type { PortalPayment } from '@/portal/types'
import { PIPELINE_STAGES, PROJECT_TYPES, REGIONS } from '@/sanity/portal/office-constants'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[] }> }

export async function generateMetadata({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  return { title: (await getProject(id))?.title ?? 'Project' }
}

/** The page's sections. `?tab=` picks one, so each has its own address; anything else shows Overview. */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'emails', label: 'Emails' },
  { key: 'money', label: 'Money' },
  { key: 'portal', label: 'Portal and files' },
  { key: 'documents', label: 'Documents' },
] as const
type Tab = (typeof TABS)[number]['key']

const studioHref = (id: string) => `/studio/portal/structure/clientProject;${encodeURIComponent(id)}`
const INVOICE_WORD: Record<string, string> = {
  draft: 'Draft',
  sent: 'Awaiting payment',
  viewed: 'Viewed, awaiting payment',
  unpaid: 'Awaiting payment',
  overdue: 'Overdue',
  partially_paid: 'Partly paid',
  paid: 'Paid',
  void: 'Void',
  deleted: 'Deleted',
}
/** Where a version stands, in the back office's words. */
const REVIEW_WORD = { 'in-progress': 'Not sent yet', 'awaiting-feedback': 'Awaiting feedback', 'changes-requested': 'Notes in', approved: 'Approved' }

const day = (iso?: string) => (iso ? fmtDay(ymd(new Date(iso)), { weekday: 'short', month: 'short', day: 'numeric' }) : '')
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })

/**
 * What has gone to the client on this project, newest first. Built only from what's already
 * recorded: the back-office log, each version's "emailed" stamp, and the quote's own dates.
 */
function sentToClient(p: OfficeProject) {
  const log = p.office.log ?? []
  const q = p.quote
  const quoteSends = log.filter((l) => l.kind === 'quote' && /\bsent\b/.test(l.text))
  const reviewSends = log.filter((l) => l.kind === 'email')
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < 5 * 60_000
  const rows: { key: string; at: string; kind: string; text: string; status?: string }[] = [
    ...quoteSends.map((l) => ({ key: l._key, at: l.at, kind: 'Quote email', text: l.text })),
    ...reviewSends.map((l) => ({ key: l._key, at: l.at, kind: 'Review email', text: l.text })),
    ...log
      .filter((l) => l.kind === 'payment' && l.text.startsWith('Asked for'))
      .map((l) => ({ key: l._key, at: l.at, kind: 'Payment request', text: l.text, status: 'Shown in their portal. No email goes out for a request.' })),
    // Versions the portal emailed about on its own (10 minutes after they're ready), which the log doesn't list.
    ...p.deliverables
      .filter((d) => d.notifiedAt && !d.dontEmail && !reviewSends.some((l) => near(l.at, d.notifiedAt!)))
      .map((d) => ({ key: `v-${d._key}`, at: d.notifiedAt!, kind: 'Review email', text: `${d.title} · ${versionLabel({ final: d.final, version: d.notifiedVersion ?? d.version })} ready for review` })),
    ...p.activity
      .filter((a) => a.text.startsWith('Delivered:'))
      .map((a) => ({ key: a._key, at: a.at, kind: 'Delivery', text: 'Final files ready to download', status: 'The delivery email goes with this, unless it’s switched off for the project in the Studio.' })),
  ]
  // A quote sent before the log kept it still shows, from the quote's own dates.
  const sentAt = q?.lastSentAt ?? q?.sharedAt
  if (q && sentAt && !quoteSends.length) rows.push({ key: 'quote', at: sentAt, kind: 'Quote email', text: `Quote v${q.version} sent` })
  rows.sort((a, b) => b.at.localeCompare(a.at))
  // Opens are only recorded for the quote, and only once, so the note goes on its latest send.
  const latestQuote = rows.find((r) => r.kind === 'Quote email')
  if (latestQuote && q) latestQuote.status = q.signature ? `Signed by ${q.signature.name} on ${day(q.signature.at)}` : q.viewedAt ? `Opened${q.viewedBy ? ` by ${q.viewedBy}` : ''} on ${day(q.viewedAt)}` : 'Not opened yet'
  return rows
}

/** "$X paid of $Y · $Z not billed yet", from the quote total and the Zoho Books invoices on record. Parts that can't be worked out are left off. */
function moneySummary(p: OfficeProject) {
  const live = (p.office.invoices ?? []).filter((i) => i.status !== 'void' && i.status !== 'deleted')
  const total = p.projectType === 'retainer' ? undefined : (p.quote?.signature?.total ?? p.quoteAmount)
  const paid = live.filter((i) => i.status === 'paid').reduce((n, i) => n + i.amount, 0)
  const billed = live.reduce((n, i) => n + i.amount, 0)
  const partly = live.filter((i) => i.status === 'partially_paid').length
  if (!live.length) return total ? `${cad(total)} quoted · nothing billed yet` : undefined
  const parts = [total ? `${cad(paid)} paid of ${cad(total)}` : `${cad(paid)} paid of ${cad(billed)} billed`]
  if (total) parts.push(billed < total ? `${cad(total - billed)} not billed yet` : 'all of it billed')
  if (partly) parts.push(`${partly} invoice${partly === 1 ? '' : 's'} partly paid, not counted`)
  return parts.join(' · ')
}

/** The same figures as the summary line, as the three parts of the quote total. Nothing without a quote total. */
function moneyParts(p: OfficeProject) {
  const live = (p.office.invoices ?? []).filter((i) => i.status !== 'void' && i.status !== 'deleted')
  const total = p.projectType === 'retainer' ? undefined : (p.quote?.signature?.total ?? p.quoteAmount)
  if (!total) return null
  const paid = live.filter((i) => i.status === 'paid').reduce((n, i) => n + i.amount, 0)
  const billed = live.reduce((n, i) => n + i.amount, 0)
  const left = Math.max(0, total - billed)
  return [
    { label: 'Paid', value: paid, text: cad(paid), tone: 'accent' as const },
    { label: 'Billed, not paid', value: billed - paid, text: cad(billed - paid), tone: 'soft' as const },
    { label: 'Left to bill', value: left, text: cad(left), tone: 'dashed' as const },
  ]
}

export default async function ProjectPage({ params, searchParams }: Props) {
  await requireAdmin()
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const p = await getProject(id)
  if (!p) notFound()
  const asked = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab
  const tab: Tab = TABS.find((x) => x.key === asked)?.key ?? 'overview'

  const t = today()
  const si = stageIndex(p.pipelineStage)
  const stage = stageTitle(p.pipelineStage)
  const sales = isSalesStage(p.pipelineStage)
  const preBooking = si < stageIndex('booked')
  const next = p.pipelineStage === 'paid' ? undefined : PIPELINE_STAGES.find((s) => s.value === nextStage(p.pipelineStage))
  const history = new Map((p.office.stageHistory ?? []).map((h) => [h.to, h.at]))
  const base = `/admin/projects/${encodeURIComponent(p._id)}`
  const leadPage = `/admin/leads/${encodeURIComponent(p._id)}`
  const emailed = (p.client.contacts ?? []).filter((c) => c.email && c.getsEmails !== false)

  // Before booking the client only has the quote page (once it's sent); after, the project page.
  const clientPath = !p.slug ? '/portal' : preBooking ? (p.quote ? `/portal/quotes/${p.slug}` : '/portal') : `/portal/${p.slug}`
  const viewAs = p.client._id ? `/api/admin/view-as?client=${encodeURIComponent(p.client._id)}&next=${encodeURIComponent(clientPath)}` : undefined
  const lib = `/admin/clients?at=${encodeURIComponent(p.client._id)}/${encodeURIComponent(p.slug ?? p._id)}`

  const log = [...(p.office.log ?? [])].sort((a, b) => b.at.localeCompare(a.at))
  const lastContact = log.find((l) => isContactLog(l.kind))

  const menu: MenuLink[] = [
    viewAs && { label: 'View as the client', href: viewAs, newTab: true },
    { label: 'Edit in the Studio', href: studioHref(p._id), newTab: true },
    sales && { label: 'Open the lead page', href: leadPage },
  ].filter((x): x is MenuLink => Boolean(x))

  // Only the Money tab needs more than the project itself.
  let zohoOrg: string | undefined
  let payments: PortalPayment[] = []
  let gstNumber: string | undefined
  if (tab === 'money') {
    const [zoho, pay, ps] = await Promise.all([
      (p.office.invoices ?? []).length ? zohoConnection().catch(() => null) : null,
      p._id.startsWith('sample-') ? [] : paymentsForProject(p._id).catch(() => []),
      getPortalSettings(),
    ])
    zohoOrg = zoho?.orgId
    payments = pay
    gstNumber = ps.gstNumber
  }

  return (
    <ProjectProgress projectId={p._id} projectTitle={p.title} checks={checklist(p)}>
      <div className="a-page">
        <Link className="text-link-plain muted small ld-back" href="/admin/pipeline">← Pipeline</Link>

        <header className="a-head">
          <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
            <h1 className="a-h1">{p.title}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {p.client._id ? <Link className="text-link" href={`/admin/clients/${p.client._id}`}>{p.client.organizationName}</Link> : p.client.organizationName}
            </p>
          </div>
          <div className="pj-head-side">
            <p className="small" style={{ margin: 0 }}>
              <strong>Last contact:</strong>{' '}
              {lastContact ? `${lastContact.text}, ${day(lastContact.at)}` : log[0] ? `none logged yet. Latest activity: ${log[0].text}, ${day(log[0].at)}` : 'none logged yet.'}
            </p>
            <ProjectMenu projectId={p._id} title={p.title} archived={Boolean(p.archived)} links={menu} />
          </div>
        </header>

        {p.archived && (
          <p className="a-sample" role="status" style={{ margin: 0 }}>Archived{p.declinedAt ? ` · declined ${fmtDay(p.declinedAt.slice(0, 10))}` : ''}. Bring it back with Unarchive under More.</p>
        )}

        <NextUp stage={stage} next={next ? { title: next.title, value: next.value } : undefined} since={day(p.office.stageChangedAt) || undefined} />

        <section className="p-card ld-stage" aria-label="Where it is">
          {sales ? (
            <p className="small" style={{ margin: 0 }}>
              Still a lead, in <strong>{stage}</strong>. <Link className="text-link" href={leadPage}>Open its lead page</Link> for the call, their details and the sales steps.
            </p>
          ) : (
            <StageStrip
              current={p.pipelineStage}
              stages={PIPELINE_STAGES.filter((s) => s.group === 'production').map((s) => ({ title: s.title, value: s.value, when: history.get(s.value) ? fmtDay(history.get(s.value)!.slice(0, 10)) : undefined }))}
            />
          )}
          <div className="pj-stage-foot">
            <span className="muted small">{sales ? 'Moving it shows a preview first.' : 'Click any stage to move it there. Every move shows a preview first.'}</span>
            <StageControl compact archived={p.archived} declined={Boolean(p.declinedAt)} projectId={p._id} projectTitle={p.title} current={p.pipelineStage} stages={PIPELINE_STAGES.map((s) => ({ title: s.title, value: s.value }))} />
          </div>
        </section>

        <nav className="pj-tabs" aria-label="Project sections">
          {TABS.map((x) => (
            <Link key={x.key} href={x.key === 'overview' ? base : `${base}?tab=${x.key}`} scroll={false} aria-current={tab === x.key ? 'page' : undefined}>{x.label}</Link>
          ))}
        </nav>

        {tab === 'overview' && <Overview p={p} stage={stage} si={si} t={t} log={log} />}
        {tab === 'emails' && <Emails p={p} />}
        {tab === 'money' && (
          <Money p={p} si={si} zohoOrg={zohoOrg}>
            <PaymentsCard
              projectId={p._id}
              on={Boolean(p.client.portalPayments)}
              payments={payments}
              deposit={p.depositAmount}
              balance={p.quoteAmount ? Math.max(0, p.quoteAmount - (p.depositAmount ?? 0)) : undefined}
              stripeOn={stripeReady()}
              testMode={stripeTestMode()}
              gst={Boolean(gstNumber) && !p.client.noGst}
            />
          </Money>
        )}
        {tab === 'portal' && <Portal p={p} si={si} lib={lib} viewAs={viewAs} clientPath={clientPath} preBooking={preBooking} to={emailed.map((c) => c.name.split(' ')[0]).join(', ') || 'the client'} />}
        {tab === 'documents' && (
          <div className="stack pj-narrow" style={{ gap: 'var(--space-4)' }}>
            <p className="small" style={{ margin: 0 }}><strong>Quote:</strong> {quoteStatus(p) ?? 'none yet. Upload the PDF below to send it for signing.'}</p>
            <QuoteCard
              projectId={p._id}
              quote={p.quote}
              total={p.quoteAmount}
              deposit={p.depositAmount}
              recipients={emailed.map((c) => c.name)}
              previewHref={p.slug && p.client._id ? `/api/admin/view-as?client=${encodeURIComponent(p.client._id)}&next=${encodeURIComponent(`/portal/quotes/${p.slug}`)}` : undefined}
            />
            {p.quoteUrl && (
              <p className="small" style={{ margin: 0 }}>
                <a className="text-link" href={p.quoteUrl} target="_blank" rel="noopener noreferrer">The quote file on record<span className="sr-only"> (opens in a new tab)</span></a>
              </p>
            )}
            <p className="muted small" style={{ margin: 0 }}>Releases and other documents to sign will live here.</p>
          </div>
        )}
      </div>
    </ProjectProgress>
  )
}

/* ── Overview ────────────────────────────────────────────────────────── */

function Overview({ p, stage, si, t, log }: { p: OfficeProject; stage: string; si: number; t: string; log: NonNullable<OfficeProject['office']['log']> }) {
  const contacts = p.client.contacts ?? []
  const main = contacts[0]
  const total = p.quote?.signature?.total ?? p.quoteAmount
  const notes = p.office.notes ?? []

  const dates = [
    ...p.schedule.map((s) => ({ label: s.title + (s.location ? ` · ${s.location}` : ''), value: fmtRange(s.start, s.end), past: (s.end ?? s.start) < t, sort: s.start })),
    ...MILESTONE_LIST.filter((m) => p.milestones[m.key]).map((m) => ({
      label: m.label,
      value: fmtDay(p.milestones[m.key]),
      past: si >= stageIndex(m.doneFrom),
      sort: p.milestones[m.key]!,
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort))

  // Everything that happened, newest first: your log and what the client did in the portal.
  const entries: LeadLogEntry[] = [
    ...log.map((l) => ({ key: l._key, at: l.at, time: l.day ? undefined : clock(l.at), text: l.text, source: 'Back office' })),
    ...p.activity.map((a) => ({ key: `p-${a._key}`, at: a.at, time: clock(a.at), text: a.text, source: 'Client portal' })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((e) => ({ key: e.key, date: day(e.at), time: e.time, text: e.text, source: e.source }))

  return (
    <div className="a-split">
      <div className="stack a-col">
        <section className="p-card" aria-labelledby="h-left">
          <h2 id="h-left" className="a-h2">Left in {stage}</h2>
          <StageChecklist />
        </section>

        <section className="p-card" aria-labelledby="h-dates">
          <div className="a-card-head">
            <h2 id="h-dates" className="a-h2">Dates and notes</h2>
            <a className="text-link small" href={studioHref(p._id)} target="_blank" rel="noopener noreferrer">Edit dates<span className="sr-only"> in the Studio (opens in a new tab)</span></a>
          </div>
          {dates.length ? (
            <dl className="key-dates">
              {dates.map((d, i) => (
                <div key={i}>
                  <dt className={d.past ? 'past' : undefined}>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted small a-empty">No shoot dates or milestones yet. Add them in the Studio.</p>
          )}
          <p className="muted small" style={{ margin: 0 }}>Changing a date moves its calendar event and TickTick tasks within 10 minutes.</p>
          <div className="row-wrap">
            <SyncButton projectId={p._id} />
            {p.office.ticktickProjectId && (
              <a className="text-link small" href={`https://ticktick.com/webapp/#p/${p.office.ticktickProjectId}/tasks`} target="_blank" rel="noopener noreferrer">
                TickTick list · {(p.office.tasks ?? []).length} tasks added<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>

          <div className="pj-sub">
            <NoteForm projectId={p._id} />
            {notes.length > 0 && (
              <ul className="a-feed ld-feed">
                {notes.map((n) => (
                  <li key={n._key}>
                    <span className="a-note">{n.text}</span>
                    <span className="muted small ld-when">{day(n.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <aside className="stack a-col a-aside ld-aside" aria-label="Details and activity">
        <section className="p-card" aria-labelledby="h-details">
          <h2 id="h-details" className="a-h2">Details</h2>
          <dl className="key-dates">
            <div><dt>Client</dt><dd>{p.client._id ? <Link className="text-link-plain" href={`/admin/clients/${p.client._id}`}>{p.client.organizationName}</Link> : p.client.organizationName}</dd></div>
            {p.projectType === 'retainer' ? (
              <div><dt>Monthly fee</dt><dd>{p.retainer?.monthlyFee ? cad(p.retainer.monthlyFee) : 'Not set'}</dd></div>
            ) : (
              <div><dt>Value</dt><dd>{total ? `${cad(total)}${p.quote?.signature ? ' · signed quote' : ' · quote total'}` : 'No quote total yet'}</dd></div>
            )}
            <div><dt>Type</dt><dd>{PROJECT_TYPES.find((x) => x.value === p.projectType)?.title ?? 'Not set'}</dd></div>
            <div><dt>Region</dt><dd>{REGIONS.find((r) => r.value === p.region)?.title ?? 'Not set'}</dd></div>
            <div><dt>Main contact</dt><dd>{main ? (main.email ? <a className="text-link-plain" href={`mailto:${main.email}`}>{main.name}</a> : main.name) : 'None yet'}</dd></div>
            <div><dt>Started</dt><dd>{p.startDate ? fmtDay(p.startDate, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No start date'}</dd></div>
            <div><dt>In {stage} since</dt><dd>{day(p.office.stageChangedAt) || 'Not recorded'}</dd></div>
            <div><dt>Deliverables</dt><dd>{p.deliverables.length ? <Link className="text-link-plain" href={`/admin/projects/${encodeURIComponent(p._id)}?tab=portal`}>{p.deliverables.length} · {p.deliverables.filter((d) => d.status !== 'approved').length} still open</Link> : 'None yet'}</dd></div>
          </dl>
          {(contacts.length > 1 || (p.crew ?? []).length > 0) && (
            <>
              <span className="a-round-label">People</span>
              <dl className="key-dates">
                {contacts.map((c) => (
                  <div key={c._key}>
                    <dt>{c.email ? <a className="text-link-plain" href={`mailto:${c.email}`}>{c.name}</a> : c.name}</dt>
                    <dd className="muted">{c.role || p.client.organizationName}</dd>
                  </div>
                ))}
                {(p.crew ?? []).map((c) => (
                  <div key={c._key}>
                    <dt>{c.name}</dt>
                    <dd className="muted">{c.role}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </section>

        <LeadActivity projectId={p._id} today={t} entries={entries} />
      </aside>
    </div>
  )
}

/* ── Emails ──────────────────────────────────────────────────────────── */

function Emails({ p }: { p: OfficeProject }) {
  const rows = sentToClient(p)
  return (
    <section className="p-card pj-narrow" aria-labelledby="h-emails">
      <div className="a-card-head">
        <h2 id="h-emails" className="a-h2">Sent to the client</h2>
        <span className="muted small">{rows.length ? 'Newest first' : ''}</span>
      </div>
      {rows.length ? (
        <ul className="a-feed ld-feed">
          {rows.map((r) => (
            <li key={r.key}>
              <span className="stack" style={{ gap: 2 }}>
                <span className="a-round-label">{r.kind}</span>
                <span>{r.text}</span>
                {r.status && <span className="muted small">{r.status}</span>}
              </span>
              <span className="muted small ld-when">{day(r.at)}<br />{clock(r.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small a-empty">Nothing has been sent to the client on this project yet.</p>
      )}
      <p className="muted small" style={{ margin: 0 }}>Email opens and replies arrive when Gmail is connected.</p>
    </section>
  )
}

/* ── Money ───────────────────────────────────────────────────────────── */

function Money({ p, si, zohoOrg, children }: { p: OfficeProject; si: number; zohoOrg?: string; children: React.ReactNode }) {
  const invoices = p.office.invoices ?? []
  const deposit = invoices.find((i) => i.kind === 'deposit')
  const final = invoices.find((i) => i.kind === 'final' || i.kind === 'retainer')
  const summary = moneySummary(p)
  const parts = moneyParts(p)
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <div className="stack" style={{ gap: 'var(--space-1)' }}>
        {summary && <p className="pj-sum">{summary}</p>}
        {parts && <div className="pj-split"><SplitBar parts={parts} /></div>}
        <p className="muted small" style={{ margin: 0 }}>
          {summary ? 'Before GST, from the quote total and the invoices on record from Zoho Books. ' : 'No quote total or invoices yet. '}
          {p.client.noGst ? 'No GST is charged to this client.' : 'GST is added on invoices.'}
        </p>
      </div>
      <div className="a-split">
        <div className="stack a-col">
          <section className="p-card" aria-labelledby="h-money">
            <div className="a-card-head">
              <h2 id="h-money" className="a-h2">Quote and invoices</h2>
              <span className="muted small">From Zoho Books</span>
            </div>
            <dl className="key-dates">
              {p.projectType === 'retainer' ? (
                <div><dt>Monthly fee</dt><dd>{p.retainer?.monthlyFee ? cad(p.retainer.monthlyFee) : '—'}</dd></div>
              ) : (
                <div><dt>Quote</dt><dd>{p.quoteAmount ? cad(p.quoteAmount) : '—'}</dd></div>
              )}
              {p.projectType !== 'retainer' && (
                <div>
                  <dt>Deposit</dt>
                  <dd>{p.depositAmount ? cad(p.depositAmount) : '—'}{deposit && ` · ${INVOICE_WORD[deposit.status ?? 'draft'] ?? deposit.status}`}</dd>
                </div>
              )}
              <div>
                <dt>{p.projectType === 'retainer' ? 'This month’s invoice' : 'Final invoice'}</dt>
                <dd className={!final && si >= stageIndex('delivered') ? 'a-accent' : undefined}>{final ? `${cad(final.amount)} · ${INVOICE_WORD[final.status ?? 'draft'] ?? final.status}` : 'Not created'}</dd>
              </div>
            </dl>
            {invoices.length > 0 && (
              <ul className="a-links">
                {invoices.map((i) => (
                  <li key={i._key}>
                    <a href={zohoOrg ? invoiceUrl(zohoOrg, i.id) : 'https://books.zohocloud.ca'} target="_blank" rel="noopener noreferrer">
                      <span className="stack"><strong>Invoice {i.number ?? i.id}</strong><span className="muted small">{i.kind === 'deposit' ? 'Deposit' : i.kind === 'retainer' ? 'Retainer' : 'Balance'} · {cad(i.amount)} · {INVOICE_WORD[i.status ?? 'draft'] ?? i.status}</span></span>
                      <span aria-hidden="true">↗</span>
                      <span className="sr-only">(opens Zoho Books)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {!final && <p className="muted small" style={{ margin: 0 }}>The final invoice is drafted when you move the project to Final delivery.</p>}
            <p className="muted small" style={{ margin: 0 }}>
              The quote total and deposit are set on the quote, under <Link className="text-link" href={`/admin/projects/${encodeURIComponent(p._id)}?tab=documents`} scroll={false}>Documents</Link>.
            </p>
          </section>
        </div>
        <div className="stack a-col a-aside pj-pay">{children}</div>
      </div>
    </div>
  )
}

/* ── Portal and files ────────────────────────────────────────────────── */

function Portal({ p, si, lib, viewAs, clientPath, preBooking, to }: { p: OfficeProject; si: number; lib: string; viewAs?: string; clientPath: string; preBooking: boolean; to: string }) {
  const round = si >= stageIndex('delivered') ? 3 : si >= stageIndex('finalcut') ? 2 : si >= stageIndex('roughcut') ? 1 : 0
  const finder = (d: OfficeProject['deliverables'][number]) => `${lib}/${versionPath(d).map(encodeURIComponent).join('/')}`
  const open = p.deliverables.filter((d) => d.status !== 'approved').length

  const notes = p.deliverables
    .flatMap((d) => (d.feedback ?? []).map((f) => ({ key: `${d._key}-${f._key}`, at: f.at, who: f.who, action: f.action, note: f.note, title: d.title, label: versionLabel(d), href: finder(d) })))
    .sort((a, b) => b.at.localeCompare(a.at))

  const links = [
    p.driveFolderId && { name: 'Drive folder', detail: `${p.client.organizationName} / ${p.title}`, href: `https://drive.google.com/drive/folders/${p.driveFolderId}` },
    p.office.ticktickProjectId && { name: 'TickTick list', detail: `${(p.office.tasks ?? []).length} tasks added`, href: `https://ticktick.com/webapp/#p/${p.office.ticktickProjectId}/tasks` },
    p.quoteUrl && { name: 'Quote', detail: 'The quote file', href: p.quoteUrl },
    p.slug && !preBooking && { name: 'Client portal page', detail: 'What the client sees', href: `/portal/${p.slug}` },
    ...(p.links ?? []).filter((l) => l.url).map((l) => ({ name: l.title || l.url!, detail: l.note || 'On the client’s project page', href: l.url! })),
  ].filter((x): x is { name: string; detail: string; href: string } => Boolean(x))

  // What the client can reach right now, in a sentence.
  const visible = preBooking
    ? p.quote?.sharedAt
      ? 'Hidden from the client until Onboarding. For now they only see the quote you sent.'
      : 'Hidden from the client. Nothing shows in their portal until a quote is sent or the project reaches Onboarding.'
    : p.slug
      ? 'The client sees this project in their portal.'
      : 'No portal address (slug) yet, so the client can’t open this project. Add one in the Studio.'

  return (
    <div className="a-split">
      <div className="stack a-col">
        <section className="p-card" aria-labelledby="h-review">
          <div className="a-card-head">
            <h2 id="h-review" className="a-h2">For review</h2>
            <span className="muted small">{p.deliverables.length ? `${open} still open` : 'Add a video or a document below'}</span>
          </div>
          <ReviewEmail
            projectId={p._id}
            to={to}
            items={p.deliverables
              .filter((d) => d.status === 'awaiting-feedback' && isLatest(d, p.deliverables))
              .map((d) => ({ key: d._key, title: d.title, version: d.version || 1, emailed: !d.dontEmail && d.notifiedVersion === (d.version || 1) }))}
          />
          {p.deliverables.length ? (
            <div className="a-table-scroll">
              <table className="a-table">
                <thead>
                  <tr>
                    <th scope="col">Video or document</th>
                    <th scope="col">Status</th>
                    <th scope="col">Version</th>
                    <th scope="col" className="num">Review link</th>
                  </tr>
                </thead>
                <tbody>
                  {p.deliverables.map((d) => (
                    <tr key={d._key}>
                      <td>
                        <Link className="a-strong-link" href={finder(d)}>{d.title}<span className="sr-only"> (opens it in the Finder)</span></Link>
                        <span className="muted small"> · {categoryOf(d) === 'video' ? 'Video' : 'Document'}{d.feedbackDue && d.status === 'awaiting-feedback' ? ` · feedback ${fmtDay(d.feedbackDue)}` : ''}</span>
                      </td>
                      <td><span className={`pill pill-${d.status}`}>{REVIEW_WORD[d.status] ?? d.status}</span></td>
                      <td>{versionLabel(d)}{d.viewedVersion === d.version && d.status === 'awaiting-feedback' ? ' · opened' : ''}</td>
                      <td className="num">{d.shareUrl ? <a className="text-link" href={d.shareUrl} target="_blank" rel="noopener noreferrer">Vimeo<span className="sr-only"> (opens in a new tab)</span></a> : d.fileUrl ? <a className="text-link" href={d.fileUrl} target="_blank" rel="noopener noreferrer">{d.fileName ?? 'File'}<span className="sr-only"> (opens in a new tab)</span></a> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted small a-empty">Nothing for review yet.</p>
          )}

          <div className="pj-sub">
            <div className="a-card-head">
              <span className="a-round-label">Revisions</span>
              <span className="muted small">Two rounds, every project</span>
            </div>
            <div className="a-rounds">
              {[
                { n: 1, title: 'Major feedback on the rough cut', due: p.milestones.round1Due },
                { n: 2, title: 'Minor changes on the final cut', due: p.milestones.round2Due },
              ].map((r) => (
                <div key={r.n} className={`a-round ${round > r.n ? 'done' : round === r.n ? 'now' : ''}`}>
                  <span className="a-round-label">Round {r.n} of 2 · {round > r.n ? 'Done' : round === r.n ? 'Now' : 'Later'}</span>
                  <strong>{r.title}</strong>
                  <span className="muted small">{r.due ? `Feedback due ${fmtDay(r.due)}` : 'No due date set'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {notes.length > 0 && (
          <section className="p-card" aria-labelledby="h-client-notes">
            <div className="a-card-head">
              <h2 id="h-client-notes" className="a-h2">Client notes</h2>
              <span className="muted small">{notes.length} from the portal</span>
            </div>
            <ul className="a-notes">
              {notes.map((n) => (
                <li key={n.key} className={`fb-${n.action}`}>
                  <p className="fb-meta">
                    <strong>{n.who ?? 'Client'}</strong> {n.action === 'approve' ? 'approved' : 'asked for changes to'}{' '}
                    <Link className="text-link" href={n.href}>{n.title} · {n.label}</Link> · {fmtDay(n.at.slice(0, 10))}
                  </p>
                  {n.note && <p className="fb-note">{n.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="p-card" aria-labelledby="h-files">
          <div className="a-card-head">
            <h2 id="h-files" className="a-h2">Videos, documents and files</h2>
            <span className="muted small">Exactly what the client sees in their portal</span>
          </div>
          <p className="muted small a-empty">Pick what you’re adding. Each button opens that folder in the Finder with the upload box ready.</p>
          <div className="row-wrap">
            <Link className="btn btn-primary btn-sm" href={`${lib}/documents`}>Add a document</Link>
            <Link className="btn btn-secondary btn-sm" href={`${lib}/videos`}>Add a video</Link>
            <Link className="btn btn-secondary btn-sm" href={`${lib}/assets`}>Share reference files</Link>
            <Link className="btn btn-secondary btn-sm" href={`${lib}/finals`}>Finals</Link>
          </div>
          <p className="muted small a-empty">A document is something for the client to review or sign off, with versions. Reference files are plain shared files, and the client can add their own there too.</p>
        </section>
      </div>

      <aside className="stack a-col a-aside" aria-label="The client’s page and links">
        <section className="p-card" aria-labelledby="h-client-page">
          <h2 id="h-client-page" className="a-h2">Client’s page</h2>
          <p className="small" style={{ margin: 0 }}>{visible}</p>
          <div className="row-wrap">
            {viewAs && <a className="btn btn-primary btn-sm" href={viewAs} target="_blank" rel="noopener noreferrer">View as the client<span className="sr-only"> (opens their portal in a new tab)</span></a>}
            {p.slug && clientPath !== '/portal' && <CopyButton text={`${SITE_URL}${clientPath}`} label="Copy the portal link" />}
          </div>
          {p.slug && clientPath !== '/portal' && <p className="muted small" style={{ margin: 0 }}>The link asks them to sign in with their email first.</p>}
        </section>

        <section className="p-card" aria-labelledby="h-links">
          <h2 id="h-links" className="a-h2">Links</h2>
          {links.length ? (
            <ul className="a-links">
              {links.map((l) => (
                <li key={l.name + l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer">
                    <span className="stack"><strong>{l.name}</strong><span className="muted small">{l.detail}</span></span>
                    <span aria-hidden="true">↗</span>
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small a-empty">No Drive folder or links yet.</p>
          )}
        </section>
      </aside>
    </div>
  )
}
