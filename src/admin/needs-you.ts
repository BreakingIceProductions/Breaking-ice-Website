import 'server-only'
import type { PortalPayment } from '@/portal/types'
import { daysBetween, fmtDate, today, ymd } from './dates'
import { needsAction } from './insights'
import { moneyView, type Goals, type MoneyProject } from './money'
import { STAGE_TASKS } from './stages'
import type { OfficeProject } from './types'

/*
 * Today's "Needs you" list, in one place, so the nav badge and the page header always show the same number.
 * Only urgent things count: reminders that aren't quiet (needsAction) and booked projects with no deposit asked for.
 * Quiet reminders and the week/month follow-ups after delivery sit lower on Today, under "When you have a minute",
 * and raise no badge. Dismissed reminders are already left out.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The stage checklist step that asks for a testimonial, as it is stored once ticked. */
const TESTIMONIAL_CHECK = `delivered:${STAGE_TASKS.delivered.findIndex((x) => /testimonial/i.test(x.title))}`

export type FollowUp = { project: OfficeProject; key: string; detail: string; when: string }

/** Moments after a film is delivered: a week on (testimonial, unless that step is ticked) and a month on. Needs the delivery day in the stage history. */
export function followUps(projects: OfficeProject[], t: string): FollowUp[] {
  const out: FollowUp[] = []
  for (const p of projects) {
    if (p.pipelineStage !== 'delivered' && p.pipelineStage !== 'paid') continue
    const at = (p.office.stageHistory ?? []).filter((h) => h.to === 'delivered' && !Number.isNaN(Date.parse(h.at))).map((h) => h.at).sort().at(-1)
    if (!at) continue
    const day = ymd(new Date(at))
    const n = daysBetween(day, t)
    const dismissed = new Set(p.office.dismissed ?? [])
    const when = `${plural(n, 'day')} ago`
    const add = (key: string, detail: string) => !dismissed.has(key) && out.push({ project: p, key, detail, when })
    if (n >= 7 && !(p.office.checks ?? []).includes(TESTIMONIAL_CHECK)) add(`followup-testimonial-${day}`, `Delivered ${fmtDate(day)}. Ask for a testimonial.`)
    if (n >= 30) add(`followup-checkin-${day}`, `Delivered ${fmtDate(day)}. Check in.`)
  }
  return out
}

/** Booked with no deposit in, and nothing sent for it (an invoice or request already out counts as owed). */
export function depositsDue(projects: OfficeProject[], payments: PortalPayment[], owedProjectIds: Set<string>): OfficeProject[] {
  return projects.filter(
    (p) =>
      p.pipelineStage === 'booked' &&
      !(p.office.invoices ?? []).some((i) => i.kind === 'deposit' && i.status === 'paid') &&
      !payments.some((x) => x.projectId === p._id && x.kind === 'deposit' && x.status === 'paid') &&
      !owedProjectIds.has(p._id),
  )
}

/** How many things are on Today's "Needs you" list: the number for the nav badge. Archived projects don't count. */
export function needsYouCount(all: MoneyProject[], payments: PortalPayment[], goals: Goals, t = today()): number {
  const projects = all.filter((p) => !p.archived)
  const owed = new Set(moneyView(all, payments, goals, t).owed.rows.map((b) => b.projectId).filter((x): x is string => Boolean(x)))
  return needsAction(projects).filter((r) => !r.quiet).length + depositsDue(projects, payments, owed).length
}
