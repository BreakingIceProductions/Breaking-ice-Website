import { requireAdmin } from '@/admin/auth'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import Link from 'next/link'
import { PendingLink } from '@/admin/ui/pending-link'
import { activityText } from '@/admin/activity-text'
import '../../../../css/admin-pages.css'
import '../../../../css/admin-simple-a.css'
import { notFound } from 'next/navigation'
import { checklist } from '@/admin/board-data'
import { getProject } from '@/admin/data'
import { composerSetup } from '@/admin/email-templates'
import { fmtRange, today, TZ, fmtDate } from '@/admin/dates'
import { cad } from '@/admin/insights'
import { isContactLog, isSalesStage } from '@/admin/lead'
import { MILESTONE_LIST } from '@/admin/milestones'
import { nextStage, stageIndex, stageTitle } from '@/admin/stages'
import type { OfficeProject } from '@/admin/types'
import { EmailComposer } from '@/admin/ui/email'
import { Dot, SplitBar } from '@/admin/ui/graphics'
import { HelpTip } from '@/admin/ui/help-tip'
import { PhoneFold } from '../../_fold'
import { CameInField, LeadActivity, type LeadLogEntry } from '@/admin/ui/lead'
import { NoteForm } from '@/admin/ui/note-form'
import { PaymentsCard } from '@/admin/ui/payments-card'
import { CopyButton, NextUp, ProjectMenu, ProjectProgress, StageStrip, type MenuLink } from '@/admin/ui/project'
import { QuoteCard } from '@/admin/ui/quote-card'
import { requestRow, sendProjects, sendTemplates } from '@/admin/sign-rows'
import { RequestTable, SendDocumentToggle, type RequestRow, type SendTemplate } from '@/admin/ui/sign-requests'
import { ReviewEmail } from '@/admin/ui/review-email'
import { StageControl } from '@/admin/ui/stage-control'
import { SyncButton } from '@/admin/ui/sync-button'
import { invoiceUrl, zohoConnection } from '@/admin/zoho'
import { SITE_URL } from '@/lib/site'
import { stripeReady } from '@/portal/config'
import { getPortalSettings } from '@/portal/data'
import { categoryOf, inReviewRoom, isLatest, needsVimeoPreview, versionLabel, versionPath, watchLink } from '@/portal/library'
import { paymentsForProject, stripeTestMode } from '@/portal/payments'
import type { PortalPayment } from '@/portal/types'
import { listRequests, listTemplates } from '@/portal/sign-store'
import { PIPELINE_STAGES, PROJECT_TYPES, REGIONS } from '@/sanity/portal/office-constants'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[]; email?: string | string[] }> }

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

const day = (iso?: string) => fmtDate(iso, 'weekday')
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })

/**
 * What has gone to the client on this project, newest first. Built only from what's already
 * recorded: the back-office log, each version's "emailed" stamp, and the quote's own dates.
 */
function sentToClient(p: OfficeProject) {
  const log = p.office.log ?? []
  const q = p.quote
  const quoteSends = log.filter((l) => l.kind === 'quote' && /\bsent\b/.test(l.text))
  // Emails from the composer are logged as "Emailed: <subject>" and listed from their own record below.
  const reviewSends = log.filter((l) => l.kind === 'email' && !l.text.startsWith('Emailed: '))
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < 5 * 60_000
  const rows: { key: string; at: string; kind: string; text: string; status?: string; body?: string }[] = [
    ...(p.office.emails ?? []).map((e) => ({ key: `e-${e._key}`, at: e.at, kind: 'Email', text: e.subject, status: `To ${e.to.join(', ')}${e.template ? ` · from “${e.template}”` : ''}`, body: e.body })),
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
      .map((a) => ({ key: a._key, at: a.at, kind: 'Delivery', text: 'Final files ready to download', status: 'The delivery email goes with this, unless it’s switched off in the project’s details.' })),
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

/** The person on a lead, as the lead page works it out: their client contact when the emails match, else what was typed on the lead. */
function leadPerson(p: OfficeProject) {
  const lead = p.office.lead ?? {}
  const listed = lead.email ? (p.client.contacts ?? []).find((c) => c.email?.toLowerCase() === lead.email!.toLowerCase()) : undefined
  return { name: listed?.name ?? lead.name, email: listed?.email ?? lead.email }
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
  const admin = await requireAdmin()
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const p = await getProject(id)
  if (!p) notFound()
  const compose = admin.viewOnly ? null : await composerSetup(p, isSalesStage(p.pipelineStage) && (p.office.lead?.email || p.office.lead?.name) ? leadPerson(p) : undefined)
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
  const production = PIPELINE_STAGES.filter((s) => s.group === 'production')

  // The one thing to do next, while the stage still has steps open (once they're ticked, Next up offers the move).
  const stepsOpen = checklist(p).some((c) => !c.done)
  const reviewable = p.deliverables.find((d) => inReviewRoom(d) && d.openComments) ?? p.deliverables.find((d) => inReviewRoom(d))
  // On every tab; it's the page's primary on Overview and secondary elsewhere, where the tab has its own main action (Portal's "View as the client", for one).
  const nextAction: { label: string; href: string } | undefined = p.archived || !stepsOpen
    ? undefined
    : sales
      ? { label: 'Open the lead page', href: leadPage }
      : (p.pipelineStage === 'roughcut' || p.pipelineStage === 'finalcut') && reviewable
        ? { label: 'Open the review room', href: `/admin/review/${encodeURIComponent(p._id)}/${encodeURIComponent(reviewable._key)}` }
        : p.pipelineStage === 'delivered' || p.pipelineStage === 'paid'
          ? { label: 'Check the invoices', href: `${base}?tab=money` }
          : p.pipelineStage === 'shoot'
            ? { label: 'Open the files', href: lib }
            : compose
              ? { label: 'Email the client', href: '?email=1' }
              : undefined

  const menu: MenuLink[] = [
    viewAs && { label: 'View as the client', href: viewAs, newTab: true },
    { label: 'Edit details in the editor', href: studioHref(p._id), newTab: true },
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
  // And the Documents tab: what's out for signing on this project, and what can be sent.
  let docRows: RequestRow[] = []
  let docTemplates: SendTemplate[] = []
  if (tab === 'documents') {
    const [reqs, templates] = await Promise.all([listRequests({ projectId: p._id }), listTemplates().catch(() => [])])
    docRows = reqs.map((r) => requestRow(r))
    docTemplates = sendTemplates(templates)
  }

  const group = sales ? PIPELINE_STAGES.filter((s) => s.group === 'sales') : production
  const stageBlock = (
    <section className="sa-card sa-stage" aria-label="Stage">
      <StageStrip current={p.pipelineStage} stages={group.map((s) => ({ title: s.title, value: s.value, when: history.get(s.value) ? fmtDate(history.get(s.value)!) : undefined }))} />
      <div className="sa-stage-foot">
        {sales && <Link className="text-link small" href={leadPage}>Lead page</Link>}
        <StageControl compact prompt="Move stage" archived={p.archived} declined={Boolean(p.declinedAt)} projectId={p._id} projectTitle={p.title} current={p.pipelineStage} stages={PIPELINE_STAGES.map((s) => ({ title: s.title, value: s.value }))} />
      </div>
    </section>
  )

  return (
    <ProjectProgress projectId={p._id} projectTitle={p.title} checks={checklist(p)}>
      <div className="a-page sa">
        <Breadcrumb trail={[{ label: 'Pipeline', href: '/admin/pipeline' }]} />

        <header className="a-head sa-head">
          <div className="stack ap-minw0">
            <span className="eyebrow sa-eyebrow">
              {p.client._id ? <Link className="text-link-plain" href={`/admin/clients/${p.client._id}`}>{p.client.organizationName}</Link> : p.client.organizationName}
            </span>
            <h1 className="a-h1 sa-h1">{p.title}</h1>
          </div>
          <div className="btn-row">
            {/* Keyed on ?email=1 so Next up's "Email the client" can open it. */}
            {compose && <EmailComposer key={sp.email === '1' ? 'open' : 'closed'} projectId={p._id} {...compose} startOpen={sp.email === '1'} />}
            <ProjectMenu projectId={p._id} title={p.title} archived={Boolean(p.archived)} links={menu} />
          </div>
        </header>

        {p.archived && (
          <p className="sa-chips" role="status"><span className="sa-chip is-hot">Archived{p.declinedAt ? ` · declined ${fmtDate(p.declinedAt)}` : ''}</span><span className="sa-muted small">Unarchive under More</span></p>
        )}

        <div className="a-pending-scope">
        <nav className="pj-tabs" aria-label="Project sections">
          {TABS.map((x) => (
            <PendingLink key={x.key} href={x.key === 'overview' ? base : `${base}?tab=${x.key}`} scroll={false} aria-current={tab === x.key ? 'page' : undefined}>{x.label}</PendingLink>
          ))}
        </nav>
        <div className="a-pending-body">

        {tab === 'overview' && (
          <div className="sa-stack">
            {stageBlock}
            {/* Next up's one primary: its own "Move to …" once the stage's steps are ticked, otherwise the action below. */}
            <NextUp
              stage={stage}
              next={next ? { title: next.title, value: next.value } : undefined}
              action={nextAction ? <Link className="btn sa-copper" href={nextAction.href} scroll={false}>{nextAction.label}</Link> : undefined}
            />
            <Overview p={p} stage={stage} si={si} t={t} log={log} lastContact={lastContact} lib={lib} base={base} />
          </div>
        )}
        {tab === 'emails' && <div className="pj-body"><Emails p={p} /></div>}
        {tab === 'money' && (
          <div className="pj-body">
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
          </div>
        )}
        {tab === 'portal' && <Portal p={p} si={si} lib={lib} viewAs={viewAs} clientPath={clientPath} preBooking={preBooking} to={emailed.map((c) => c.name.split(' ')[0]).join(', ') || 'the client'} />}
        {tab === 'documents' && (
          <div className="stack pj-narrow ap-gap-4 pj-body">
            <QuoteCard
              projectId={p._id}
              quote={p.quote}
              total={p.quoteAmount}
              deposit={p.depositAmount}
              recipients={emailed.map((c) => c.name)}
              previewHref={p.slug && p.client._id ? `/api/admin/view-as?client=${encodeURIComponent(p.client._id)}&next=${encodeURIComponent(`/portal/quotes/${p.slug}`)}` : undefined}
            />
            {p.quoteUrl && (
              <p className="small m0">
                <a className="text-link" href={p.quoteUrl} target="_blank" rel="noopener noreferrer">Quote file on record<span className="sr-only"> (opens in a new tab)</span></a>
              </p>
            )}
            <section className="p-card sa-docs" aria-labelledby="h-to-sign">
              <div className="a-card-head">
                <h2 id="h-to-sign" className="a-h2">Documents to sign</h2>
                <span className="sa-chips">
                  {docRows.length > 0 && <span className="sa-chip">{docRows.filter((r) => r.status === 'out' || r.status === 'viewed').length} out</span>}
                  {docRows.length > 0 && <span className="sa-chip">{docRows.filter((r) => r.status === 'signed').length} signed</span>}
                  <HelpTip label="About documents to sign">
                    Agreements, sign-offs and releases. Wording lives in the <Link className="text-link" href="/admin/library">Library</Link>. Signed copies are saved to this project’s Drive folder (Contract for the client’s documents, Releases for people’s) when it has one.
                  </HelpTip>
                </span>
              </div>
              <RequestTable rows={docRows} showProject={false} empty="None yet" />
              {!admin.viewOnly && (
                <div className="pj-sub">
                  <SendDocumentToggle templates={docTemplates} projects={sendProjects([{ ...p, archived: false }])} projectId={p._id} />
                </div>
              )}
            </section>
          </div>
        )}
        </div>
        </div>
      </div>
    </ProjectProgress>
  )
}

/* ── Cuts: one card per video or document, poster frame and a status dot ── */

const REVIEW_TONE = { 'in-progress': 'quiet', 'awaiting-feedback': 'wait', 'changes-requested': 'accent', approved: 'done' } as const

function Cuts({ p, lib, detail }: { p: OfficeProject; lib: string; detail?: boolean }) {
  const finder = (d: OfficeProject['deliverables'][number]) => `${lib}/${versionPath(d).map(encodeURIComponent).join('/')}`
  const add = <Link className="sa-cut-addlink" href={`${lib}/videos`}><span aria-hidden="true">+</span> Add a cut</Link>
  if (!p.deliverables.length)
    return (
      <ul className="sa-cuts">
        <li className="sa-cut sa-cut-add">
          <Link href={`${lib}/videos`}><span aria-hidden="true">+</span> Add a cut</Link>
        </li>
      </ul>
    )
  return (
    <>
    <ul className={`sa-cuts${detail ? ' sa-cuts-detail' : ''}`}>
      {p.deliverables.map((d) => {
        const room = inReviewRoom(d) ? `/admin/review/${encodeURIComponent(p._id)}/${encodeURIComponent(d._key)}` : undefined
        // A ProRes delivery has no review room: its Vimeo copy once ready, otherwise the library.
        const out = !room ? (needsVimeoPreview(d) ? watchLink(d) : (d.shareUrl ?? d.fileUrl)) : undefined
        const href = room ?? out ?? finder(d)
        const poster = d.thumbUrl ?? d.vimeoThumb
        const video = categoryOf(d) === 'video'
        const word = REVIEW_WORD[d.status] ?? d.status
        const body = (
          <>
            <span className="sa-poster">
              {poster ? <img src={poster} alt="" loading="lazy" /> : <span className="sa-poster-icon" aria-hidden="true">{video ? '▶' : '▤'}</span>}
              <span className="sa-badge">{versionLabel(d)}</span>
            </span>
            <span className="sa-cut-foot">
              <Dot tone={REVIEW_TONE[d.status] ?? 'quiet'} />
              <strong>{d.title}</strong>
              <span className="sa-cut-state">{d.openComments ? `${d.openComments} open` : word}</span>
              <span className="sr-only">{d.openComments ? ` (${word})` : ''}{room ? ', opens the review room' : out ? ' (opens in a new tab)' : ', opens it in Clients'}</span>
            </span>
          </>
        )
        return (
          <li key={d._key} className="sa-cut">
            {out ? <a className="sa-cut-main" href={href} target="_blank" rel="noopener noreferrer">{body}</a> : <Link className="sa-cut-main" href={href}>{body}</Link>}
            {detail && (
              <span className="sa-cut-meta">
                <span className="sa-chip">{video ? 'Video' : 'Document'}</span>
                {d.feedbackDue && d.status === 'awaiting-feedback' && <span className="sa-chip is-hot">Feedback {fmtDate(d.feedbackDue)}</span>}
                {d.viewedVersion === d.version && d.status === 'awaiting-feedback' && <span className="sa-chip">Opened</span>}
                {href !== finder(d) && <Link className="text-link small" href={finder(d)}>Files<span className="sr-only"> for {d.title} in Clients</span></Link>}
              </span>
            )}
          </li>
        )
      })}
    </ul>
    {!detail && add}
    </>
  )
}

/* ── Overview ────────────────────────────────────────────────────────── */

type LogEntry = NonNullable<OfficeProject['office']['log']>[number]

function Overview({ p, stage, si, t, log, lastContact, lib, base }: { p: OfficeProject; stage: string; si: number; t: string; log: LogEntry[]; lastContact?: LogEntry; lib: string; base: string }) {
  const contacts = p.client.contacts ?? []
  const main = contacts[0]
  const total = p.quote?.signature?.total ?? p.quoteAmount
  const notes = p.office.notes ?? []
  const parts = moneyParts(p)
  const summary = moneySummary(p)

  const dates = [
    ...p.schedule.map((s) => ({ label: s.title + (s.location ? ` · ${s.location}` : ''), value: fmtRange(s.start, s.end), past: (s.end ?? s.start) < t, sort: s.start })),
    ...MILESTONE_LIST.filter((m) => p.milestones[m.key]).map((m) => ({
      label: m.label,
      value: fmtDate(p.milestones[m.key]),
      past: si >= stageIndex(m.doneFrom),
      sort: p.milestones[m.key]!,
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort))
  const soonest = dates.findIndex((d) => !d.past)

  // Everything that happened, newest first: your log and what the client did in the portal.
  const entries: LeadLogEntry[] = [
    ...log.map((l) => ({ key: l._key, at: l.at, time: l.day ? undefined : clock(l.at), text: l.text, source: 'Back office' })),
    ...p.activity.map((a) => ({ key: `p-${a._key}`, at: a.at, time: clock(a.at), text: a.text, source: 'Client portal' })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((e) => ({ key: e.key, date: day(e.at), time: e.time, text: e.text, source: e.source }))

  return (
    <>
      {(p.deliverables.length > 0 || si >= stageIndex('shoot')) && (
        <section className="sa-section" aria-labelledby="h-cuts">
          <h2 id="h-cuts" className="sa-h2">Cuts</h2>
          <Cuts p={p} lib={lib} />
        </section>
      )}

      <div className="sa-two">
        <section className="sa-card" aria-labelledby="h-dates">
          <div className="sa-card-head">
            <h2 id="h-dates" className="sa-h3">Dates</h2>
            <a className="text-link small" href={studioHref(p._id)} target="_blank" rel="noopener noreferrer">Edit ↗<span className="sr-only"> dates in the editor (opens in a new tab)</span></a>
          </div>
          {dates.length ? (
            <ul className="sa-datechips">
              {dates.map((d, i) => (
                <li key={i} className={`sa-chip sa-chip-lg${d.past ? ' is-past' : ''}${i === soonest ? ' is-hot' : ''}`}>
                  {d.label} · {d.value}{d.past && <span className="sr-only"> (done)</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted small m0">No dates yet</p>
          )}
        </section>

        <section className="sa-card" aria-labelledby="h-paid">
          <div className="sa-card-head">
            <h2 id="h-paid" className="sa-h3">Paid</h2>
            <Link className="text-link small" href={`${base}?tab=money`} scroll={false}>Money<span className="sr-only"> tab</span></Link>
          </div>
          {p.projectType === 'retainer' ? (
            <p className="sa-muted small m0">{p.retainer?.monthlyFee ? `${cad(p.retainer.monthlyFee)} a month` : 'Monthly fee not set'}</p>
          ) : parts ? (
            <>
              <SplitBar parts={parts} legend={false} />
              <p className="sa-muted small m0">{cad(parts[0].value)} of {cad(total!)}</p>
            </>
          ) : (
            <p className="sa-muted small m0">{summary ?? 'No quote total yet'}</p>
          )}
        </section>
      </div>

      <PhoneFold id="details" folded className="sa-fold sa-details" summary={<span className="sa-fold-link">Details, people and activity</span>}>
        <div className="a-split">
          <div className="stack a-col">
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
                <div><dt>Started</dt><dd>{p.startDate ? fmtDate(p.startDate) : 'No start date'}</dd></div>
              </dl>
              <CameInField projectId={p._id} value={p.office.lead?.cameIn} />
              <dl className="key-dates">
                <div><dt>In {stage} since</dt><dd>{day(p.office.stageChangedAt) || 'Not recorded'}</dd></div>
                <div><dt>Last contact</dt><dd>{lastContact ? `${activityText(lastContact.text)}, ${day(lastContact.at)}` : log[0] ? `None logged. Latest: ${activityText(log[0].text)}, ${day(log[0].at)}` : 'None logged'}</dd></div>
                <div><dt>Deliverables</dt><dd>{p.deliverables.length ? <Link className="text-link-plain" href={`${base}?tab=portal`}>{p.deliverables.length} · {p.deliverables.filter((d) => d.status !== 'approved').length} still open</Link> : 'None yet'}</dd></div>
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
              <div className="row-wrap">
                <SyncButton projectId={p._id} />
                {p.office.ticktickProjectId && (
                  <a className="text-link small" href={`https://ticktick.com/webapp/#p/${p.office.ticktickProjectId}/tasks`} target="_blank" rel="noopener noreferrer">
                    TickTick · {(p.office.tasks ?? []).length} tasks<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
                <HelpTip label="About dates and syncing">Changing a date moves its calendar event and TickTick tasks within 10 minutes.</HelpTip>
              </div>
            </section>

            <section className="p-card" aria-labelledby="h-notes">
              <h2 id="h-notes" className="a-h2">Notes</h2>
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
            </section>
          </div>
          <aside className="stack a-col a-aside ld-aside" aria-label="Activity">
            <LeadActivity projectId={p._id} today={t} entries={entries} />
          </aside>
        </div>
      </PhoneFold>
    </>
  )
}

/* ── Emails ──────────────────────────────────────────────────────────── */

const KIND_ICON: Record<string, string> = { Email: '✉', 'Quote email': '▤', 'Review email': '▶', 'Payment request': '$', Delivery: '↓' }

function Emails({ p }: { p: OfficeProject }) {
  const rows = sentToClient(p)
  return (
    <section className="p-card pj-narrow" aria-labelledby="h-emails">
      <div className="a-card-head">
        <h2 id="h-emails" className="a-h2">Sent to the client</h2>
        {p.client._id && <Link className="text-link small" href={`/admin/emails?client=${encodeURIComponent(p.client._id)}`}>Open the full conversation</Link>}
      </div>
      {rows.length ? (
        <ul className="sa-feed">
          {rows.map((r) => (
            <li key={r.key}>
              <span className="sa-icon" aria-hidden="true" title={r.kind}>{KIND_ICON[r.kind] ?? '✉'}</span>
              <span className="sa-feed-text">
                <span className="sr-only">{r.kind}: </span>
                <strong>{r.text}</strong>
                {r.status && <span className="sa-need-sub">{r.status}</span>}
                {r.body && (
                  <details className="lb-email-text">
                    <summary className="small">Show the email</summary>
                    <pre>{r.body}</pre>
                  </details>
                )}
              </span>
              <span className="sa-chip">{day(r.at)} · {clock(r.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sa-muted small a-empty">None yet</p>
      )}
    </section>
  )
}

/* ── Money ───────────────────────────────────────────────────────────── */

function Money({ p, si, zohoOrg, children }: { p: OfficeProject; si: number; zohoOrg?: string; children: React.ReactNode }) {
  const invoices = p.office.invoices ?? []
  const deposit = invoices.find((i) => i.kind === 'deposit')
  const final = invoices.find((i) => i.kind === 'final' || i.kind === 'retainer')
  const parts = moneyParts(p)
  const summary = moneySummary(p)
  const partly = invoices.filter((i) => i.status === 'partially_paid').length
  return (
    <div className="stack ap-gap-4">
      <section className="sa-card" aria-label="Paid so far">
        {parts ? <SplitBar parts={parts} /> : <p className="sa-muted small m0">{summary ?? 'No quote total or invoices yet'}</p>}
        <span className="sa-chips">
          <span className="sa-chip">Before GST</span>
          <span className="sa-chip">{p.client.noGst ? 'No GST for this client' : 'GST added on invoices'}</span>
          {partly > 0 && <span className="sa-chip is-hot">{partly} partly paid, not counted</span>}
        </span>
      </section>
      <div className="a-split">
        <div className="stack a-col">
          <section className="p-card" aria-labelledby="h-money">
            <div className="a-card-head">
              <h2 id="h-money" className="a-h2">Quote and invoices</h2>
              <HelpTip label="About quote and invoices">
                From the quote total and the invoices on record in Zoho Books. The final invoice is drafted when you move the project to Final delivery.
              </HelpTip>
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
            <p className="small m0">
              <Link className="text-link" href={`/admin/projects/${encodeURIComponent(p._id)}?tab=documents`} scroll={false}>Edit the quote total and deposit</Link>
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
    p.office.ticktickProjectId && { name: 'TickTick list', detail: `${(p.office.tasks ?? []).length} tasks`, href: `https://ticktick.com/webapp/#p/${p.office.ticktickProjectId}/tasks` },
    p.quoteUrl && { name: 'Quote', detail: 'The quote file', href: p.quoteUrl },
    p.slug && !preBooking && { name: 'Client portal page', detail: 'What the client sees', href: `/portal/${p.slug}` },
    ...(p.links ?? []).filter((l) => l.url).map((l) => ({ name: l.title || l.url!, detail: l.note || 'On the client’s project page', href: l.url! })),
  ].filter((x): x is { name: string; detail: string; href: string } => Boolean(x))

  // What the client can reach right now: a chip, with the reason one press away.
  const visible = preBooking
    ? { chip: p.quote?.sharedAt ? 'Quote only' : 'Hidden', tone: 'wait' as const, why: p.quote?.sharedAt ? 'Hidden from the client until Onboarding. For now they only see the quote you sent.' : 'Hidden from the client. Nothing shows in their portal until a quote is sent or the project reaches Onboarding.' }
    : p.slug
      ? { chip: 'Visible to the client', tone: 'done' as const, why: 'The client sees this project in their portal. The link asks them to sign in with their email first.' }
      : { chip: 'No portal address', tone: 'accent' as const, why: 'No portal address (slug) yet, so the client can’t open this project. Add one with More → Edit details in the editor.' }

  const rounds = [
    { n: 1, title: 'Rough cut · major feedback', due: p.milestones.round1Due },
    { n: 2, title: 'Final cut · minor changes', due: p.milestones.round2Due },
  ]

  return (
    <div className="a-split">
      <div className="stack a-col">
        <section className="p-card" aria-labelledby="h-review">
          <div className="a-card-head">
            <h2 id="h-review" className="a-h2">For review</h2>
            {p.deliverables.length > 0 && <span className="sa-chip">{open} open</span>}
          </div>
          <ReviewEmail
            projectId={p._id}
            to={to}
            items={p.deliverables
              .filter((d) => d.status === 'awaiting-feedback' && isLatest(d, p.deliverables))
              .map((d) => ({ key: d._key, title: d.title, version: d.version || 1, emailed: !d.dontEmail && d.notifiedVersion === (d.version || 1) }))}
          />
          <Cuts p={p} lib={lib} detail />

          <div className="pj-sub">
            <span className="a-round-label">Revisions</span>
            <ol className="sa-rounds" aria-label={`Revisions: ${round > 2 ? 'both rounds done' : round === 0 ? 'not started' : `round ${round} of 2`}`}>
              {rounds.map((r) => (
                <li key={r.n} className={round > r.n ? 'is-done' : round === r.n ? 'is-current' : ''}>
                  <span className="sa-stage-bar" aria-hidden="true" />
                  <strong>Round {r.n}<span className="sr-only">{round > r.n ? ' (done)' : round === r.n ? ' (now)' : ' (later)'}</span></strong>
                  <span className="sa-muted small">{r.title}</span>
                  <span className={`sa-chip${r.due && round === r.n ? ' is-hot' : ''}`}>{r.due ? `Due ${fmtDate(r.due)}` : 'No due date'}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {notes.length > 0 && (
          <section className="p-card" aria-labelledby="h-client-notes">
            <div className="a-card-head">
              <h2 id="h-client-notes" className="a-h2">Client notes</h2>
              <span className="sa-chip">{notes.length}</span>
            </div>
            <ul className="a-notes">
              {notes.map((n) => (
                <li key={n.key} className={`fb-${n.action}`}>
                  <p className="fb-meta">
                    <strong>{n.who ?? 'Client'}</strong> {n.action === 'approve' ? 'approved' : 'asked for changes to'}{' '}
                    <Link className="text-link" href={n.href}>{n.title} · {n.label}</Link> · {fmtDate(n.at)}
                  </p>
                  {n.note && <p className="fb-note">{n.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="p-card" aria-labelledby="h-files">
          <div className="a-card-head">
            <h2 id="h-files" className="a-h2">Files</h2>
            <HelpTip label="About files">
              Exactly what the client sees in their portal. Each button opens that folder in Clients with the upload box ready. A document is something for the client to review or sign off, with versions. Reference files are plain shared files, and the client can add their own there too.
            </HelpTip>
          </div>
          <div className="row-wrap">
            <Link className="btn btn-secondary btn-sm" href={`${lib}/documents`}>Add a document</Link>
            <Link className="btn btn-secondary btn-sm" href={`${lib}/videos`}>Add a video</Link>
            <Link className="btn btn-secondary btn-sm" href={`${lib}/assets`}>Share reference files</Link>
            <Link className="btn btn-secondary btn-sm" href={`${lib}/finals`}>Finals</Link>
          </div>
        </section>
      </div>

      <aside className="stack a-col a-aside" aria-label="The client’s page and links">
        <section className="p-card" aria-labelledby="h-client-page">
          <div className="a-card-head">
            <h2 id="h-client-page" className="a-h2">Client’s page</h2>
            <HelpTip label="About the client’s page">{visible.why}</HelpTip>
          </div>
          <p className="sa-chips m0"><span className="sa-chip sa-chip-lg"><Dot tone={visible.tone} /> {visible.chip}</span></p>
          <div className="row-wrap">
            {viewAs && <a className="btn sa-copper btn-sm" href={viewAs} target="_blank" rel="noopener noreferrer">View as the client<span className="sr-only"> (opens their portal in a new tab)</span></a>}
            {p.slug && clientPath !== '/portal' && <CopyButton text={`${SITE_URL}${clientPath}`} label="Copy the portal link" />}
          </div>
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
            <p className="sa-muted small a-empty">None yet</p>
          )}
        </section>
      </aside>
    </div>
  )
}
