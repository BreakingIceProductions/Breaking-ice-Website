import { MILESTONE_LIST } from './milestones'
import { addDays, daysBetween, daysSince, fmtDay, today, ymd } from './dates'
import type { OfficeProject } from './types'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'

/** What the dashboard works out from the projects. Pure functions: no fetching here. */

const idx = (s: string) => PIPELINE_STAGES.findIndex((x) => x.value === s)
export const isActive = (p: OfficeProject) => idx(p.pipelineStage) >= idx('booked') && idx(p.pipelineStage) <= idx('delivered')

const finalAmount = (p: OfficeProject) =>
  p.projectType === 'retainer' ? p.retainer?.monthlyFee ?? 0 : Math.max(0, (p.quoteAmount ?? 0) - (p.depositAmount ?? 0))
const hasFinalInvoice = (p: OfficeProject) => (p.office.invoices ?? []).some((i) => i.kind === 'final' || i.kind === 'retainer')
/** Sent from Zoho Books and not fully paid yet. */
const UNPAID = new Set(['sent', 'viewed', 'overdue', 'unpaid', 'partially_paid'])
const unpaidSent = (i: { status?: string }) => UNPAID.has(i.status ?? '')

export function kpis(projects: OfficeProject[]) {
  const quoted = projects.filter((p) => p.pipelineStage === 'quoted')
  const notInvoiced = projects.filter((p) => p.pipelineStage === 'delivered' && !hasFinalInvoice(p))
  const invoices = projects.flatMap((p) => p.office.invoices ?? [])
  const sent = invoices.filter(unpaidSent)
  const drafts = invoices.filter((i) => i.status === 'draft')
  const regions = new Set(projects.filter(isActive).map((p) => p.region).filter(Boolean))
  return {
    active: projects.filter(isActive).length,
    activeNote: regions.size > 1 ? 'Across Alberta and the NWT' : regions.has('nwt') ? 'In the NWT' : regions.has('alberta') ? 'In Alberta' : 'Booked to delivered',
    pipeline: quoted.reduce((n, p) => n + (p.quoteAmount ?? 0), 0),
    pipelineCount: quoted.length,
    pipelineMissing: quoted.filter((p) => !p.quoteAmount).length,
    notInvoiced: notInvoiced.reduce((n, p) => n + finalAmount(p), 0),
    notInvoicedCount: notInvoiced.length,
    outstanding: sent.reduce((n, i) => n + (i.outstanding ?? i.amount), 0),
    outstandingCount: sent.length,
    draftCount: drafts.length,
  }
}

export type Row = { project: OfficeProject; detail: string; when: string; urgent?: boolean; sort: number }

export function needsAction(projects: OfficeProject[]): Row[] {
  const t = today()
  const rows: Row[] = []
  for (const p of projects) {
    const si = idx(p.pipelineStage)
    if (p.pipelineStage === 'lead') {
      const d = daysSince(p.office.stageChangedAt) ?? 0
      rows.push({ project: p, detail: 'New lead. Reply and send a quote.', when: d ? `${d} day${d === 1 ? '' : 's'}` : 'Today', urgent: d >= 2, sort: 10 - d })
    }
    for (const d of p.deliverables.filter((x) => x.status === 'changes-requested'))
      rows.push({ project: p, detail: `Notes in on ${d.title}. Start the fixes.`, when: `v${d.version}`, sort: 5 })
    if (p.pipelineStage === 'delivered' && !hasFinalInvoice(p)) {
      const d = daysSince(p.office.stageChangedAt) ?? 0
      rows.push({ project: p, detail: finalAmount(p) ? 'Delivered. No invoice yet.' : 'Delivered. Add the quote total to draft the invoice.', when: `${d} day${d === 1 ? '' : 's'}`, urgent: true, sort: 0 })
    }
    for (const i of (p.office.invoices ?? []).filter((x) => x.status === 'draft')) {
      const d = daysSince(i.createdAt) ?? 0
      if (d >= 1) rows.push({ project: p, detail: `Draft invoice${i.number ? ` ${i.number}` : ''} hasn’t been sent from Zoho Books.`, when: `${d} days`, sort: 3 })
    }
    for (const m of MILESTONE_LIST) {
      const date = p.milestones[m.key]
      if (!date || !m.yours || si >= idx(m.doneFrom)) continue
      const n = daysBetween(t, date)
      if (n <= 3) rows.push({ project: p, detail: `${m.label} ${n < 0 ? 'was' : ''} ${fmtDay(date, { weekday: 'long' })}.`.replace('  ', ' '), when: n < 0 ? `${-n} days late` : n === 0 ? 'Today' : `In ${n} day${n === 1 ? '' : 's'}`, urgent: n <= 0, sort: n })
    }
    if (si >= idx('roughcut') && si < idx('delivered') && p.deliverables.length && p.deliverables.every((d) => d.status === 'approved'))
      rows.push({ project: p, detail: 'Everything’s approved. Move it to Delivered.', when: 'Ready', sort: 2 })
  }
  return rows.sort((a, b) => a.sort - b.sort)
}

export function waitingOnClients(projects: OfficeProject[]): Row[] {
  const rows: Row[] = []
  for (const p of projects) {
    for (const d of p.deliverables.filter((x) => x.status === 'awaiting-feedback')) {
      const days = daysSince(d.notifiedAt ?? d.readyAt) ?? 0
      const late = d.feedbackDue ? daysBetween(d.feedbackDue, today()) : 0
      rows.push({
        project: p,
        detail: `${d.title} v${d.version} sent.${d.viewedVersion === d.version ? ' They’ve opened it.' : ''} Waiting on feedback.`,
        when: `${days} day${days === 1 ? '' : 's'}`,
        urgent: late > 0 || days >= 7,
        sort: -days,
      })
    }
    if (p.pipelineStage === 'quoted') {
      const days = daysSince(p.office.stageChangedAt) ?? 0
      rows.push({ project: p, detail: 'Quote sent. No answer yet.', when: `${days} day${days === 1 ? '' : 's'}`, urgent: days >= 7, sort: -days })
    }
  }
  return rows.sort((a, b) => a.sort - b.sort)
}

export type WeekEvent = { project: OfficeProject; kind: 'shoot' | 'travel' | 'meeting' | 'deadline' | 'other'; title: string; meta: string }

export function week(projects: OfficeProject[], start = today()) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const map = new Map<string, WeekEvent[]>(days.map((d) => [d, []]))
  for (const p of projects) {
    if (p.pipelineStage === 'paid') continue
    for (const s of p.schedule) {
      const end = s.end && s.end > s.start ? s.end : s.start
      for (const d of days)
        if (d >= s.start && d <= end)
          map.get(d)!.push({ project: p, kind: s.kind ?? 'other', title: s.title, meta: [s.time, p.client.organizationName].filter(Boolean).join(' · ') })
    }
    for (const m of MILESTONE_LIST) {
      const date = p.milestones[m.key]
      if (date && map.has(date) && idx(p.pipelineStage) < idx(m.doneFrom))
        map.get(date)!.push({ project: p, kind: 'deadline', title: m.label, meta: p.title })
    }
  }
  return days.map((d) => ({ date: d, events: map.get(d)! }))
}

export type FeedItem = { project: OfficeProject; at: string; text: string; source: string }

export function activityFeed(projects: OfficeProject[], limit = 8): FeedItem[] {
  const items: FeedItem[] = []
  for (const p of projects) {
    for (const a of p.activity) items.push({ project: p, at: a.at, text: a.text, source: 'Client portal' })
    for (const l of p.office.log ?? []) items.push({ project: p, at: l.at, text: l.text, source: 'Back office' })
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

export const ago = (iso: string) => {
  const d = daysBetween(ymd(new Date(iso)), today())
  if (d <= 0) {
    const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000)
    return h < 1 ? 'Just now' : `${h}h`
  }
  return d < 7 ? `${d}d` : fmtDay(ymd(new Date(iso)))
}

export const cad = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`
