import 'server-only'
import { adminReady, calendarReady } from './config'
import { syncProjectCalendar } from './calendar'
import { listProjects, updateInvoiceRecord, updateTaskDue } from './data'
import { addDays } from './dates'
import { moveTaskDue, ticktickConnection } from './ticktick'
import { getInvoice, statusOf, zohoConnection } from './zoho'
import type { OfficeProject } from './types'

/**
 * Runs with the portal scheduler every 10 minutes:
 *  - calendar events follow date changes made in the Studio
 *  - TickTick tasks tied to a milestone move with it
 *  - invoice statuses (sent, paid) come back from Zoho Books
 * Works through projects until its time budget is spent; the next run carries on.
 */
export async function syncOffice(deadline: number) {
  if (!adminReady()) return []
  const log: string[] = []
  const projects = (await listProjects()).filter((p) => p.pipelineStage !== 'paid')
  const [tt, zoho] = await Promise.all([ticktickConnection().catch(() => null), zohoConnection().catch(() => null)])

  for (const p of projects) {
    if (Date.now() > deadline) break
    try {
      if (calendarReady()) {
        const r = await syncProjectCalendar(p)
        if ('created' in r && r.created + r.updated + r.removed) log.push(`calendar ${p.title}: +${r.created} ~${r.updated} -${r.removed}`)
      }
      if (tt) await shiftTasks(p, log)
      if (zoho) await refreshInvoices(p, log)
    } catch (e) {
      log.push(`office sync failed for ${p.title}: ${String(e).slice(0, 140)}`)
    }
  }
  return log
}

async function shiftTasks(p: OfficeProject, log: string[]) {
  const list = p.office.ticktickProjectId
  if (!list) return
  for (const t of p.office.tasks ?? []) {
    if (!t.anchor || t.anchor === 'stage') continue
    const base = p.milestones[t.anchor]
    if (!base) continue
    const due = addDays(base, t.offsetDays ?? 0)
    if (due === t.due) continue
    try {
      await moveTaskDue(list, t.id, due)
      await updateTaskDue(p._id, t._key, due)
      log.push(`task moved: ${t.title} → ${due}`)
    } catch (e) {
      // A task you deleted or finished in TickTick stays as it is; record the new date so it isn't retried every run.
      await updateTaskDue(p._id, t._key, due).catch(() => {})
      log.push(`task not moved (${t.title}): ${String(e).slice(0, 80)}`)
    }
  }
}

export async function refreshInvoices(p: OfficeProject, log?: string[]) {
  for (const inv of p.office.invoices ?? []) {
    if (inv.status === 'paid' || inv.status === 'void' || inv.status === 'deleted') continue
    // Every 10 minutes is plenty; skip ones checked in the last 30.
    if (inv.syncedAt && Date.now() - Date.parse(inv.syncedAt) < 30 * 60_000) continue
    const fresh = await getInvoice(inv.id)
    const status = fresh ? statusOf(fresh) : 'deleted'
    const outstanding = fresh?.balance ?? inv.outstanding
    await updateInvoiceRecord(p._id, inv._key, { status, outstanding, syncedAt: new Date().toISOString() })
    if (status !== inv.status) log?.push(`invoice ${inv.number ?? inv.id}: ${inv.status} → ${status}`)
  }
}
