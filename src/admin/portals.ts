import 'server-only'
import { portalClient } from '@/portal/data'
import { CLIENT_STAGES, clientStage, isLatest } from '@/portal/library'
import { methodLabel } from '@/portal/pay-methods'
import type { PortalPayment } from '@/portal/types'
import { adminSampleMode } from './config'
import { fmtDay, relDays, ymd } from './dates'
import { cad, isActive, needsAction, waitingOnClients, type Row } from './insights'
import { isSalesStage, pageHref } from './lead'
import { stageTitle } from './stages'
import type { OfficeProject } from './types'

/**
 * The Client portals page: every project's portal from the back-office side.
 * Built only from what is already recorded. Nothing records a client signing in or
 * opening the portal as a whole, so "last client activity" is the newest thing a
 * client is on record as doing: opening a quote, downloading, uploading, leaving
 * notes, approving or signing.
 */

export type Waiting = { key: string; text: string; when?: string; urgent?: boolean; href?: string; external?: boolean }

export type PortalCard = {
  id: string
  title: string
  client: string
  /** The client's id, for grouping projects under their portal. */
  clientId?: string
  stage: string
  /** The stage name the client sees on their side. */
  theySee: string
  hidden: boolean
  /** Sales stage: the client only has the quote page. */
  quoteOnly: boolean
  /** A booked project with no portal address yet: the client can't open it. */
  noAddress: boolean
  /** Something a client did is on record (with or without a time). */
  opened: boolean
  lastClient?: { when: string; text: string }
  onClient: Waiting[]
  onYou: Waiting[]
  viewAs?: string
  href: string
  /** Newest thing recorded on the project by anyone, for sorting. */
  latest: string
}

type OpenPayment = Pick<PortalPayment, '_id' | 'projectId' | 'kind' | 'label' | 'total' | 'status' | 'method' | 'zohoInvoiceId'>

/** Portal payment requests that aren't settled yet, for every project at once. */
export async function openPayments(): Promise<OpenPayment[]> {
  if (adminSampleMode()) return []
  try {
    return (
      (await portalClient.fetch<OpenPayment[]>(
        `*[_type == "portalPayment" && status in ["due", "processing"]] | order(createdAt asc){_id, projectId, kind, label, total, status, method, zohoInvoiceId}`,
        {},
        { cache: 'no-store' },
      )) ?? []
    )
  } catch (e) {
    console.error('[admin] open payments query failed', e)
    return []
  }
}

/** Activity the client did themselves. The feed also holds what the back office and the scheduler wrote. */
const byClient = (a: { kind?: string; text: string }) =>
  a.kind === 'view' ||
  a.kind === 'download' ||
  a.kind === 'comment' ||
  (a.kind === 'upload' && !a.text.startsWith('Shared ')) ||
  (a.kind === 'approved' && (/ approved /.test(a.text) || a.text.endsWith('signed the quote')))

function lastClientActivity(p: OfficeProject) {
  const items = [
    ...p.activity.filter(byClient).map((a) => ({ at: a.at, text: a.text })),
    ...p.deliverables.flatMap((d) =>
      (d.feedback ?? []).map((f) => ({ at: f.at, text: `${f.who ?? 'Client'} ${f.action === 'approve' ? 'approved' : 'left notes on'} ${d.title}` })),
    ),
    ...(p.quote?.viewedAt ? [{ at: p.quote.viewedAt, text: `${p.quote.viewedBy ?? 'Client'} opened the quote` }] : []),
    ...(p.quote?.signature ? [{ at: p.quote.signature.at, text: `${p.quote.signature.name} signed the quote` }] : []),
  ].filter((x) => x.at)
  return items.sort((a, b) => b.at.localeCompare(a.at))[0]
}

const INVOICE_KIND = { deposit: 'Deposit invoice', final: 'Final invoice', retainer: 'Retainer invoice' }
/** Sent from Zoho Books and not fully paid yet (the same statuses the dashboard counts as outstanding). */
const UNPAID = new Set(['sent', 'viewed', 'overdue', 'unpaid', 'partially_paid'])

/** Where a dashboard reminder opens, the same way the dashboard does it. */
function rowHref(r: Row, page: string) {
  const k = r.key ?? ''
  if (!page.startsWith('/admin/projects/')) return page
  const m = /^comments-(.+)-v\d+$/.exec(k)
  if (m) return `/admin/review/${encodeURIComponent(r.project._id)}/${encodeURIComponent(m[1])}`
  return /^(no-invoice|draft)-/.test(k) ? `${page}?tab=money` : /^(fixes|feedback)-/.test(k) ? `${page}?tab=portal` : page
}

const hasQuoteOut = (p: OfficeProject) =>
  isSalesStage(p.pipelineStage) && (p.pipelineStage === 'quoted' || Boolean(p.quote?.sharedAt && !p.quote.signature))

function card(p: OfficeProject, mine: Row[], theirs: Row[], payments: OpenPayment[]): PortalCard {
  const page = pageHref(p._id, p.pipelineStage)
  const projectPage = `/admin/projects/${encodeURIComponent(p._id)}`
  const quoteOnly = isSalesStage(p.pipelineStage)
  const hidden = Boolean(p.hiddenFromClient)
  const lib = `/admin/clients?at=${encodeURIComponent(p.client._id)}/${encodeURIComponent(p.slug ?? p._id)}`
  const pays = payments.filter((x) => x.projectId === p._id)

  const onClient: Waiting[] = []
  if (!hidden) {
    for (const r of theirs) {
      if (r.key?.startsWith('quote-')) {
        const q = p.quote
        const sent = q?.sharedAt ? ` ${fmtDay(ymd(new Date(q.lastSentAt ?? q.sharedAt)))}` : ''
        onClient.push({ key: r.key, text: `Quote sent${sent}, ${q?.viewedAt ? 'opened' : 'not opened yet'}. Not signed.`, when: r.when, urgent: r.urgent })
      } else onClient.push({ key: r.key ?? r.detail, text: r.detail, when: r.when, urgent: r.urgent })
    }
    // A quote shared before the project reached Quoted on the board.
    if (quoteOnly && p.pipelineStage !== 'quoted' && p.quote?.sharedAt && !p.quote.signature)
      onClient.push({ key: 'quote-shared', text: `Quote sent ${fmtDay(ymd(new Date(p.quote.lastSentAt ?? p.quote.sharedAt)))}, ${p.quote.viewedAt ? 'opened' : 'not opened yet'}. Not signed.` })
    for (const pay of pays.filter((x) => x.status === 'due'))
      onClient.push({ key: pay._id, text: `${pay.label} due in their portal: ${cad(pay.total)}.` })
    // Zoho Books invoices out and unpaid, unless a portal payment above is the same invoice.
    const viaPortal = new Set(pays.map((x) => x.zohoInvoiceId).filter(Boolean))
    for (const i of (p.office.invoices ?? []).filter((x) => UNPAID.has(x.status ?? '') && !viaPortal.has(x.id)))
      onClient.push({
        key: `inv-${i.id}`,
        text: `${INVOICE_KIND[i.kind]}${i.number ? ` ${i.number}` : ''} sent, ${i.status === 'partially_paid' ? 'partly paid' : 'not paid'}: ${cad(i.outstanding ?? i.amount)}.`,
        urgent: i.status === 'overdue',
      })
  }

  const onYou: Waiting[] = []
  for (const r of mine) {
    // Notes on a version that a newer sent version has already answered aren't waiting any more.
    const d = /^(fixes|comments)-/.test(r.key ?? '') ? p.deliverables.find((x) => r.key === `fixes-${x._key}-v${x.version}` || r.key === `comments-${x._key}-v${x.version}`) : undefined
    if (d && !isLatest(d, p.deliverables)) continue
    onYou.push({ key: r.key ?? r.detail, text: r.detail, when: r.when, urgent: r.urgent, href: rowHref(r, page) })
  }
  for (const pay of pays.filter((x) => x.status === 'processing'))
    onYou.push({
      key: pay._id,
      text: `${pay.label}: they say it’s on its way${pay.method ? ` by ${methodLabel(pay.method)}` : ''} (${cad(pay.total)}). Mark it paid once it’s in.`,
      href: `${projectPage}?tab=money`,
    })
  if (!quoteOnly) {
    if (!p.slug)
      onYou.push({ key: 'no-slug', text: 'No portal address yet, so they can’t open it. Add one in the editor.', href: `/studio/portal/structure/clientProject;${encodeURIComponent(p._id)}`, external: true })
    if (!p.driveFolderId && p.client._id) onYou.push({ key: 'no-drive', text: 'No Drive folder yet.', href: lib })
    if (!p.deliverables.some((d) => d.status !== 'in-progress') && !(p.links ?? []).length)
      onYou.push({ key: 'nothing-shared', text: 'Nothing shared for review yet.', href: `${projectPage}?tab=portal` })
  }

  const last = lastClientActivity(p)
  // A version marked opened has no time on it, but it does mean they've been in.
  const opened = Boolean(last) || p.deliverables.some((d) => d.viewedVersion)
  const clientPath = !p.slug ? '/portal' : quoteOnly ? (p.quote ? `/portal/quotes/${p.slug}` : '/portal') : hidden ? '/portal' : `/portal/${p.slug}`
  const stamps = [p._updatedAt, ...p.activity.map((a) => a.at), ...(p.office.log ?? []).map((l) => l.at), p.office.stageChangedAt].filter(Boolean) as string[]

  return {
    id: p._id,
    title: p.title,
    client: p.client.organizationName,
    clientId: p.client._id || undefined,
    stage: stageTitle(p.pipelineStage),
    theySee: CLIENT_STAGES[clientStage(p.pipelineStage, p.status) - 1].title,
    hidden,
    quoteOnly,
    noAddress: !quoteOnly && !p.slug,
    opened,
    lastClient: last ? { when: relDays(ymd(new Date(last.at))), text: last.text } : undefined,
    onClient,
    onYou,
    viewAs: p.client._id ? `/api/admin/view-as?client=${encodeURIComponent(p.client._id)}&next=${encodeURIComponent(clientPath)}` : undefined,
    href: page,
    latest: stamps.sort().at(-1) ?? '',
  }
}

const rank = (c: PortalCard) => (c.onYou.length ? 0 : c.onClient.length ? 1 : 2)
const order = (a: PortalCard, b: PortalCard) => rank(a) - rank(b) || b.latest.localeCompare(a.latest)

export function portalsOverview(all: OfficeProject[], payments: OpenPayment[]) {
  const open = all.filter((p) => !p.archived)
  const mine = needsAction(open)
  const theirs = waitingOnClients(open)
  const build = (p: OfficeProject) => card(p, mine.filter((r) => r.project._id === p._id), theirs.filter((r) => r.project._id === p._id), payments)

  const live = open.filter(isActive).map(build).sort(order)
  const quotes = open.filter(hasQuoteOut).map(build).sort(order)
  const done = all
    .filter((p) => p.archived || p.pipelineStage === 'paid')
    .map((p) => ({ id: p._id, title: p.title, client: p.client.organizationName, href: pageHref(p._id, p.pipelineStage), note: p.archived ? 'Archived' : 'Paid' }))

  // The client-side numbers leave out projects the client can't see.
  const portals = live.filter((c) => !c.hidden)
  const shown = [...live, ...quotes]
  const withClient = shown.filter((c) => c.onClient.length)
  const withYou = shown.filter((c) => c.onYou.length)
  return {
    live,
    quotes,
    done,
    tiles: {
      portals: portals.length,
      active: live.length,
      hidden: live.length - portals.length,
      onClient: withClient.reduce((n, c) => n + c.onClient.length, 0),
      onClientProjects: withClient.length,
      onYou: withYou.reduce((n, c) => n + c.onYou.length, 0),
      onYouProjects: withYou.length,
      notOpened: portals.filter((c) => !c.opened && !c.noAddress).length,
    },
  }
}
