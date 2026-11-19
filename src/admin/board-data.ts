import 'server-only'
import { PIPELINE_STAGES, PROJECT_TYPES, REGIONS, type PipelineStage } from '@/sanity/portal/office-constants'
import { addDays, daysBetween, daysSince, fmtDay, today } from './dates'
import { MILESTONE_LIST } from './milestones'
import { STAGE_TASKS, stageIndex } from './stages'
import type { OfficeProject } from './types'

/** Everything a board card and its pop-up need, as plain data for the browser. */
export type BoardCard = {
  id: string
  title: string
  client: string
  clientId?: string
  stage: PipelineStage
  type?: string
  region?: string
  amount?: number
  deposit?: number
  days: number | null
  /** Sitting too long before booking (new lead 3+ days, call or proposal 5+, proposal out 7+). */
  cold?: boolean
  checks: { key: string; label: string; done: boolean }[]
  next: string
  /** What to show as next once every step is ticked. */
  ready: string
  nextDate?: string
  dates: { label: string; date: string; past: boolean }[]
  quote?: string
  invoices: { label: string; status: string; amount: number }[]
  links: { label: string; href: string }[]
  notes: { at: string; text: string }[]
}

/** A stage's checklist: the same steps the stage sets up as tasks, ticked off here. */
export function checklist(p: OfficeProject) {
  const done = new Set(p.office.checks ?? [])
  return STAGE_TASKS[p.pipelineStage]
    .map((t, i) => ({ t, key: `${p.pipelineStage}:${i}` }))
    .filter(({ t }) => !t.when || t.when(p))
    .map(({ t, key }) => ({ key, label: t.title, done: done.has(key) }))
}

/** Days in a sales stage before a card is flagged as going cold. */
const COLD_AFTER: Partial<Record<PipelineStage, number>> = { lead: 3, call: 5, proposal: 5, quoted: 7 }

const INVOICE_KIND = { deposit: 'Deposit invoice', final: 'Final invoice', retainer: 'Retainer invoice' }

export function boardCard(p: OfficeProject): BoardCard {
  const t = today()
  const si = stageIndex(p.pipelineStage)
  const checks = checklist(p)
  const open = checks.find((c) => !c.done)
  const after = PIPELINE_STAGES[si + 1]
  const days = daysSince(p.office.stageChangedAt)
  const upcoming = MILESTONE_LIST.filter((m) => p.milestones[m.key] && si < stageIndex(m.doneFrom))
    .map((m) => ({ label: m.label, date: p.milestones[m.key]! }))
    .concat(p.schedule.map((x) => ({ label: x.title, date: x.start })))
    .sort((a, b) => a.date.localeCompare(b.date))
  const nextUp = upcoming.find((d) => d.date >= t) ?? upcoming[0]
  const sig = p.quote?.signature
  const preBooking = si < stageIndex('booked')
  const clientPath = !p.slug ? '/portal' : preBooking ? (p.quote ? `/portal/quotes/${p.slug}` : '/portal') : `/portal/${p.slug}`
  const lib = `/admin/clients?at=${encodeURIComponent(p.client._id)}/${encodeURIComponent(p.slug ?? p._id)}`
  return {
    id: p._id,
    title: p.title,
    client: p.client.organizationName,
    clientId: p.client._id || undefined,
    stage: p.pipelineStage,
    type: PROJECT_TYPES.find((x) => x.value === p.projectType)?.title,
    region: REGIONS.find((r) => r.value === p.region)?.title,
    amount: p.quoteAmount,
    deposit: p.depositAmount,
    days,
    cold: (days ?? 0) >= (COLD_AFTER[p.pipelineStage] ?? Infinity),
    checks,
    next: open ? open.label : after ? `Ready for ${after.title}` : 'All done',
    ready: after ? `Ready for ${after.title}` : 'All done',
    nextDate: nextUp ? `${nextUp.label} · ${fmtDay(nextUp.date)}` : undefined,
    dates: upcoming.map((d) => ({ label: d.label, date: fmtDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), past: d.date < t })),
    quote: sig
      ? `Signed by ${sig.name} on ${fmtDay(sig.at.slice(0, 10))}`
      : p.quote?.sharedAt
        ? `Sent ${fmtDay(p.quote.sharedAt.slice(0, 10))}${p.quote.viewedAt ? ', opened' : ', not opened yet'}`
        : p.quote
          ? 'Drafted, not sent'
          : undefined,
    invoices: (p.office.invoices ?? []).map((i) => ({ label: `${INVOICE_KIND[i.kind]}${i.number ? ` ${i.number}` : ''}`, status: i.status ?? 'draft', amount: i.amount })),
    links: [
      p.client._id && { label: 'Add a document', href: `${lib}/documents` },
      p.client._id && { label: 'Share reference files', href: `${lib}/assets` },
      p.client._id && { label: 'View as the client', href: `/api/admin/view-as?client=${encodeURIComponent(p.client._id)}&next=${encodeURIComponent(clientPath)}` },
      p.driveFolderId && { label: 'Drive folder', href: `https://drive.google.com/drive/folders/${p.driveFolderId}` },
      ...(p.links ?? []).map((l) => ({ label: l.title, href: l.url })),
      { label: 'Edit in the Studio', href: `/studio/portal/structure/clientProject;${encodeURIComponent(p._id)}` },
    ].filter((x): x is { label: string; href: string } => Boolean(x)),
    notes: (p.office.notes ?? []).slice(-3).reverse().map((n) => ({ at: fmtDay(n.at.slice(0, 10)), text: n.text })),
  }
}

/** Shoots and deliveries in the next two weeks, for the tiles above the board. */
export function nextTwoWeeks(projects: OfficeProject[]) {
  const t = today()
  const end = addDays(t, 14)
  const inWindow = (d?: string) => Boolean(d && d >= t && d <= end)
  const live = projects.filter((p) => !p.archived)
  return {
    shoots: live.flatMap((p) => p.schedule.filter((s) => s.kind === 'shoot' && inWindow(s.start))).length,
    deliveries: live.filter((p) => stageIndex(p.pipelineStage) < stageIndex('delivered') && inWindow(p.milestones.deliveryDue)).length,
  }
}

/** Booked against declined over the last 90 days. Null when neither happened. */
export function winRate(projects: OfficeProject[]) {
  const recent = (iso?: string) => Boolean(iso && daysBetween(iso.slice(0, 10), today()) <= 90)
  const won = projects.filter((p) => (p.office.stageHistory ?? []).some((h) => h.to === 'booked' && recent(h.at))).length
  const lost = projects.filter((p) => recent(p.declinedAt)).length
  return won + lost ? { won, lost, rate: Math.round((won / (won + lost)) * 100) } : null
}

const before = (p: OfficeProject, stage: PipelineStage) => stageIndex(p.pipelineStage) < stageIndex(stage)
const sum = (list: OfficeProject[]) => list.reduce((n, p) => n + (p.quoteAmount ?? 0), 0)

/** The "How it's going" tiles under the pipeline board. Archived projects only count toward the win rate. */
export function pipelineTiles(projects: OfficeProject[]) {
  const live = projects.filter((p) => !p.archived)
  const inPlay = live.filter((p) => p.pipelineStage === 'proposal' || p.pipelineStage === 'quoted')
  const production = live.filter((p) => !before(p, 'booked') && before(p, 'paid'))
  // Onboarding without a paid deposit invoice: none drafted yet counts as waiting too.
  const noDeposit = live.filter((p) => p.pipelineStage === 'booked' && !(p.office.invoices ?? []).some((i) => i.kind === 'deposit' && i.status === 'paid'))
  return {
    inPlay: { sum: sum(inPlay), count: inPlay.length, missing: inPlay.filter((p) => !p.quoteAmount).length },
    production: { sum: sum(production), count: production.length },
    waitingOnDeposit: noDeposit.length,
    win: winRate(projects),
    shoots: nextTwoWeeks(projects).shoots,
  }
}
