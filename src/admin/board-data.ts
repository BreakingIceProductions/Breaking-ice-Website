import 'server-only'
import { PIPELINE_STAGES, PROJECT_TYPES, REGIONS, type PipelineStage } from '@/sanity/portal/office-constants'
import { addDays, daysBetween, daysSince, fmtDay, today } from './dates'
import { budgetTitle, isContactLog, isSalesStage, pageHref } from './lead'
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
  /** The budget range they gave, for a lead with no quote total yet. */
  budget?: string
  /** The full page: the lead page before booking, the project page after. */
  href: string
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
  /** Leads board only: the person who got in touch. */
  person?: string
  /** Leads board only: when you last spoke, and whether it's your turn (they wrote last, or a follow-up is due). */
  spoke?: { text: string; waiting: boolean; why: string }
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

/** Where the portal quote stands, in a few words. Undefined when there's no quote yet. */
export function quoteStatus(p: OfficeProject) {
  const sig = p.quote?.signature
  return sig
    ? `Signed by ${sig.name} on ${fmtDay(sig.at.slice(0, 10))}`
    : p.quote?.sharedAt
      ? `Sent ${fmtDay(p.quote.sharedAt.slice(0, 10))}${p.quote.viewedAt ? ', opened' : ', not opened yet'}`
      : p.quote
        ? 'Drafted, not sent'
        : undefined
}

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
    budget: isSalesStage(p.pipelineStage) ? budgetTitle(p.office.lead?.budget) : undefined,
    href: pageHref(p._id, p.pipelineStage),
    deposit: p.depositAmount,
    days,
    cold: (days ?? 0) >= (COLD_AFTER[p.pipelineStage] ?? Infinity),
    checks,
    next: open ? open.label : after ? `Ready for ${after.title}` : 'All done',
    ready: after ? `Ready for ${after.title}` : 'All done',
    nextDate: nextUp ? `${nextUp.label} · ${fmtDay(nextUp.date)}` : undefined,
    dates: upcoming.map((d) => ({ label: d.label, date: fmtDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), past: d.date < t })),
    quote: quoteStatus(p),
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

/** The newest Gmail message with a client's people, from the Emails list (mine: Josh sent it). */
export type LastMail = { at: string; mine: boolean }

const ago = (d: number) => (d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`)

/**
 * "Last spoke N days ago" for a lead card, and whether it's waiting on Josh: the last contact came from them (an
 * email in Gmail), a new lead nobody has answered yet, or a follow-up is due. A follow-up is due after the same
 * quiet spell that marks a card as going cold (new lead 3 days, talking or quoting 5, quoted 7), counted from the
 * last contact rather than the stage move. Contact is what's on record: calls and messages logged on the lead,
 * emails sent from the back office, and the newest Gmail message with the client's people.
 */
export function lastSpoke(p: OfficeProject, mail?: LastMail): NonNullable<BoardCard['spoke']> {
  const touches: { at: string; inbound: boolean }[] = [
    ...(p.office.log ?? []).filter((l) => isContactLog(l.kind)).map((l) => ({ at: l.at, inbound: false })),
    ...(p.office.emails ?? []).map((e) => ({ at: e.at, inbound: false })),
    ...(mail ? [{ at: mail.at, inbound: !mail.mine }] : []),
  ].filter((t) => t.at)
  const last = touches.sort((a, b) => b.at.localeCompare(a.at))[0]
  const limit = COLD_AFTER[p.pipelineStage] ?? Infinity
  if (!last) {
    const cameIn = p.office.lead?.cameIn ?? [...(p.office.stageHistory ?? [])].map((h) => h.at).sort()[0] ?? p.office.stageChangedAt
    const days = p.office.lead?.cameIn ? daysBetween(p.office.lead.cameIn, today()) : daysSince(cameIn)
    if (p.pipelineStage === 'lead') return { text: days == null ? 'No reply yet' : `Came in ${ago(days)}, no reply yet`, waiting: true, why: 'They got in touch and haven’t had a reply on record' }
    const due = (daysSince(p.office.stageChangedAt) ?? 0) >= limit
    return { text: 'No contact logged', waiting: due, why: due ? 'Follow-up due: nothing on record for a while' : 'No calls or emails on record yet' }
  }
  const days = daysSince(last.at) ?? 0
  const due = days >= limit
  return {
    text: `Last spoke ${ago(days)}`,
    waiting: last.inbound || due,
    why: last.inbound ? 'They wrote last: it’s your turn' : due ? 'Follow-up due' : 'You were last in touch',
  }
}

/** A card on the Leads & Quotes board: the board card plus who they are and when you last spoke. */
export function leadCard(p: OfficeProject, mail?: LastMail): BoardCard {
  const lead = p.office.lead ?? {}
  const contacts = p.client.contacts ?? []
  const listed = lead.email ? contacts.find((c) => c.email?.toLowerCase() === lead.email!.toLowerCase()) : undefined
  const person = listed?.name ?? lead.name ?? contacts[0]?.name
  return { ...boardCard(p), person: person || undefined, spoke: lastSpoke(p, mail) }
}

/** Leads that became projects in the last 60 days: their first move from a sales stage to Onboarding or later. */
export function recentlyWon(projects: OfficeProject[], days = 60) {
  return projects
    .filter((p) => !isSalesStage(p.pipelineStage))
    .map((p) => {
      const h = (p.office.stageHistory ?? []).filter((x) => x.to === 'booked').map((x) => x.at).sort()[0]
      return { p, at: h ?? p.quote?.signature?.at }
    })
    .filter((x): x is { p: OfficeProject; at: string } => Boolean(x.at && daysBetween(x.at.slice(0, 10), today()) <= days))
    .sort((a, b) => b.at.localeCompare(a.at))
}
