import 'server-only'
import { PIPELINE_STAGES, type PipelineStage } from '@/sanity/portal/office-constants'
import { calendarReady, ticktickReady, xeroReady } from './config'
import { syncProjectCalendar, wantedEvents } from './calendar'
import { addInvoiceRecord, addLog, addTaskRecords, setOffice, setPipelineStage, setPortalStatus } from './data'
import { addDays, today } from './dates'
import { createList, createTask, ticktickConnection } from './ticktick'
import { createDraftInvoice, ensureXeroContact, statusOf, xeroConnection } from './xero'
import type { Milestones, OfficeProject, PlannedAction, StagePlan } from './types'

/**
 * What each stage sets in motion. Moving a project builds a plan from these,
 * shows it as a preview, and only runs what you confirm.
 *
 * Task due dates are "N days after the move" or "N days after a milestone";
 * milestone-based ones move when you change the milestone.
 */

type TaskTpl = { title: string; offset: number; anchor?: keyof Milestones; when?: (p: OfficeProject) => boolean }

export const STAGE_TASKS: Record<PipelineStage, TaskTpl[]> = {
  lead: [{ title: 'Reply and book a discovery call', offset: 1 }],
  quoted: [{ title: 'Follow up on the quote', offset: 5 }],
  booked: [
    { title: 'Send the contract', offset: 1 },
    { title: 'Lock shoot dates and add them to the project', offset: 3 },
    { title: 'Create the Frame.io project and paste its link', offset: 3 },
  ],
  preproduction: [
    { title: 'Shot list and interview questions', offset: 4 },
    { title: 'Confirm interviewees and locations', offset: 5 },
    { title: 'Book flights, charter and accommodation', offset: 2, when: (p) => p.region === 'nwt' || p.schedule.some((s) => s.kind === 'travel') },
    { title: 'Gear checklist and batteries', offset: 6 },
  ],
  shoot: [
    { title: 'Offload and back up footage (two copies)', offset: 0 },
    { title: 'Log selects and best moments', offset: 3 },
  ],
  roughcut: [
    { title: 'Post the rough cut to Frame.io and set it to “Awaiting feedback”', offset: 0 },
    { title: 'Chase round 1 feedback', offset: 1, anchor: 'round1Due' },
  ],
  finalcut: [
    { title: 'Post the final cut to Frame.io', offset: 0 },
    { title: 'Chase round 2 feedback (minor changes only)', offset: 1, anchor: 'round2Due' },
  ],
  delivered: [
    { title: 'Upload finals to the client’s Finals folder', offset: 0 },
    { title: 'Send the delivery email with the portal link', offset: 0 },
    { title: 'Ask for a testimonial', offset: 7 },
    { title: 'Archive project media', offset: 14 },
  ],
  paid: [{ title: 'Send a thank-you note', offset: 1 }],
}

/** Portal status and the 1–4 public process stage that go with each pipeline stage. */
const PORTAL: Partial<Record<PipelineStage, { status: 'in-production' | 'in-review' | 'delivered'; stage: number }>> = {
  booked: { status: 'in-production', stage: 1 },
  preproduction: { status: 'in-production', stage: 2 },
  shoot: { status: 'in-production', stage: 3 },
  roughcut: { status: 'in-review', stage: 4 },
  finalcut: { status: 'in-review', stage: 4 },
  delivered: { status: 'delivered', stage: 4 },
}

export const stageTitle = (s: string) => PIPELINE_STAGES.find((x) => x.value === s)?.title ?? s
export const stageIndex = (s: string) => PIPELINE_STAGES.findIndex((x) => x.value === s)
export const nextStage = (s: PipelineStage) => PIPELINE_STAGES[Math.min(PIPELINE_STAGES.length - 1, stageIndex(s) + 1)].value

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function dueFor(p: OfficeProject, t: TaskTpl) {
  const base = t.anchor ? p.milestones[t.anchor] : today()
  return base ? addDays(base, t.offset) : addDays(today(), t.offset)
}

/** Builds the preview. Nothing here writes anything. */
export async function planStage(p: OfficeProject, to: PipelineStage): Promise<StagePlan> {
  const from = p.pipelineStage
  const warnings: string[] = []
  const actions: PlannedAction[] = []
  const [tt, xero] = await Promise.all([ticktickConnection().catch(() => null), xeroConnection().catch(() => null)])
  const ttBlocked = !ticktickReady() ? 'TickTick isn’t set up yet (Settings)' : !tt ? 'Connect TickTick in Settings' : undefined
  const xeroBlocked = !xeroReady() ? 'Xero isn’t set up yet (Settings)' : !xero ? 'Connect Xero in Settings' : undefined

  const fi = stageIndex(from)
  const ti = stageIndex(to)
  if (ti < fi) warnings.push(`Moving back from ${stageTitle(from)}. Nothing already done is undone; ${stageTitle(to)}’s checklist is added again.`)
  if (ti - fi > 1) warnings.push(`Skipping ${ti - fi - 1} stage${ti - fi - 1 === 1 ? '' : 's'}. Their checklists won’t be added.`)

  actions.push({ id: 'stage', app: 'Back office', kind: 'stage', label: `Stage set to ${stageTitle(to)}` })

  // TickTick
  const tasks = STAGE_TASKS[to].filter((t) => !t.when || t.when(p))
  if (tasks.length) {
    if (!p.office.ticktickProjectId)
      actions.push({ id: 'tt-list', app: 'TickTick', kind: 'ticktick-list', label: `New list “${p.client.organizationName} · ${p.title}”`, blocked: ttBlocked })
    tasks.forEach((t, i) => {
      const due = dueFor(p, t)
      actions.push({
        id: `tt-${i}`,
        app: 'TickTick',
        kind: 'ticktick-task',
        label: `${t.title} (due ${new Date(`${due}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })})`,
        blocked: ttBlocked,
        data: { title: t.title, due, anchor: t.anchor, offset: t.offset },
      })
    })
  }

  // Google Calendar: how the calendar will look with the new stage.
  const after = { ...p, pipelineStage: to }
  const wanted = wantedEvents(after)
  if (wanted.length) {
    const have = new Set((p.office.calendar ?? []).map((r) => r._key))
    const added = wanted.filter((w) => !have.has(w.source)).length
    const ticked = wanted.filter((w) => w.summary.startsWith('✓ ') && !wantedEvents(p).find((x) => x.source === w.source)?.summary.startsWith('✓ ')).length
    const parts = [added && `${added} date${added === 1 ? '' : 's'} added`, ticked && `${ticked} marked done`].filter(Boolean)
    actions.push({
      id: 'cal',
      app: 'Google Calendar',
      kind: 'calendar-sync',
      label: parts.length ? `Breaking Ice Projects: ${parts.join(', ')}` : 'Breaking Ice Projects: already up to date',
      blocked: calendarReady() ? undefined : 'Add GOOGLE_CALENDAR_ID in Vercel (Settings explains)',
    })
  } else if (ti >= stageIndex('booked')) {
    warnings.push('No milestones or shoot dates yet, so nothing goes on the calendar. Add them in the project.')
  }

  // Xero: always drafts.
  const invoices = p.office.invoices ?? []
  if (to === 'booked' && (p.depositAmount ?? 0) > 0 && !invoices.some((i) => i.kind === 'deposit')) {
    actions.push({
      id: 'inv-deposit',
      app: 'Xero',
      kind: 'invoice',
      label: `Deposit invoice for ${money(p.depositAmount!)} + GST, saved as a draft. Nothing is sent until you approve it in Xero.`,
      blocked: xeroBlocked,
      data: { kind: 'deposit', amount: p.depositAmount },
    })
  }
  if (to === 'delivered' && !invoices.some((i) => i.kind === 'final' || i.kind === 'retainer')) {
    const isRetainer = p.projectType === 'retainer'
    const amount = isRetainer ? p.retainer?.monthlyFee ?? 0 : Math.max(0, (p.quoteAmount ?? 0) - (p.depositAmount ?? 0))
    if (amount > 0)
      actions.push({
        id: 'inv-final',
        app: 'Xero',
        kind: 'invoice',
        label: `${isRetainer ? 'Retainer' : 'Final'} invoice for ${money(amount)} + GST, saved as a draft. Nothing is sent until you approve it in Xero.`,
        blocked: xeroBlocked,
        data: { kind: isRetainer ? 'retainer' : 'final', amount },
      })
    else warnings.push(`No ${isRetainer ? 'monthly fee' : 'quote total'} on this project, so no invoice is drafted. Add it in the project to get one.`)
  }

  // Client portal
  const portal = PORTAL[to]
  if (portal && (portal.status !== p.status || portal.stage !== p.stage)) {
    const statusWord = { 'in-production': 'In production', 'in-review': 'In review', delivered: 'Delivered' }[portal.status]
    actions.push({
      id: 'portal',
      app: 'Client portal',
      kind: 'portal-status',
      label: `${p.client.organizationName} sees “${statusWord}”${fi < stageIndex('booked') && ti >= stageIndex('booked') ? ', and the project appears in their portal' : ''}`,
      data: portal,
    })
  }
  if (ti < stageIndex('booked') && fi >= stageIndex('booked'))
    warnings.push('Leads and quotes are hidden from clients, so this project disappears from their portal.')

  if (to === 'delivered') {
    const open = p.deliverables.filter((d) => d.status !== 'approved')
    if (open.length)
      warnings.push(`${open.length} of ${p.deliverables.length} deliverable${p.deliverables.length === 1 ? ' isn’t' : 's aren’t'} approved yet (${open.map((d) => d.title).join(', ')}). Move anyway, or finish ${open.length === 1 ? 'it' : 'them'} first.`)
  }

  return { from, to, warnings, actions }
}

export type RunResult = { id: string; ok: boolean; message: string }

/** Runs the confirmed actions, in order. Each one stands alone: one failure never stops the rest. */
export async function runStage(p: OfficeProject, to: PipelineStage, skip: string[] = []): Promise<RunResult[]> {
  const plan = await planStage(p, to)
  const results: RunResult[] = []
  const chosen = plan.actions.filter((a) => a.id === 'stage' || (!skip.includes(a.id) && !a.blocked))

  // The stage itself first: if that can't be saved, nothing else runs.
  await setPipelineStage(p, to)
  results.push({ id: 'stage', ok: true, message: `Stage set to ${stageTitle(to)}` })
  const after: OfficeProject = { ...p, pipelineStage: to }

  // TickTick list, then its tasks.
  let listId = p.office.ticktickProjectId
  const newTasks: Parameters<typeof addTaskRecords>[1] = []
  for (const a of chosen.filter((x) => x.app === 'TickTick')) {
    try {
      if (a.kind === 'ticktick-list') {
        listId = await createList(`${p.client.organizationName} · ${p.title}`)
        await setOffice(p._id, { ticktickProjectId: listId })
        results.push({ id: a.id, ok: true, message: a.label })
        continue
      }
      if (!listId) throw new Error('No TickTick list for this project yet')
      const d = a.data as { title: string; due: string; anchor?: keyof Milestones; offset: number }
      const id = await createTask(listId, { title: d.title, due: d.due, content: `${p.title} · ${p.client.organizationName}` })
      newTasks.push({ id, title: d.title, due: d.due, anchor: d.anchor, offsetDays: d.offset })
      results.push({ id: a.id, ok: true, message: d.title })
    } catch (e) {
      results.push({ id: a.id, ok: false, message: `${a.label}: ${String(e).slice(0, 160)}` })
    }
  }
  await addTaskRecords(p._id, newTasks).catch(() => {})

  for (const a of chosen) {
    try {
      if (a.kind === 'calendar-sync') {
        const r = await syncProjectCalendar(after)
        results.push({ id: a.id, ok: true, message: 'skipped' in r ? 'Calendar not connected' : `Calendar: ${r.created} added, ${r.updated} updated, ${r.removed} removed` })
      } else if (a.kind === 'invoice') {
        const d = a.data as { kind: 'deposit' | 'final' | 'retainer'; amount: number }
        const contact = await ensureXeroContact(p.client)
        const what = d.kind === 'deposit' ? 'Deposit' : d.kind === 'retainer' ? 'Monthly retainer' : 'Balance'
        const inv = await createDraftInvoice(
          contact,
          { description: `${p.title}: ${what.toLowerCase()}`, amount: d.amount, reference: p.title },
          `bi-${p._id}-${d.kind}${d.kind === 'retainer' ? `-${today().slice(0, 7)}` : ''}`,
        )
        await addInvoiceRecord(p._id, {
          kind: d.kind,
          id: inv.InvoiceID,
          number: inv.InvoiceNumber,
          amount: d.amount,
          status: statusOf(inv),
          outstanding: inv.AmountDue ?? d.amount,
          createdAt: new Date().toISOString(),
        })
        results.push({ id: a.id, ok: true, message: `Draft invoice ${inv.InvoiceNumber ?? ''} saved in Xero`.replace('  ', ' ') })
      } else if (a.kind === 'portal-status') {
        await setPortalStatus(p, a.data as { status: string; stage: number })
        results.push({ id: a.id, ok: true, message: a.label })
      }
    } catch (e) {
      results.push({ id: a.id, ok: false, message: `${a.label}: ${String(e).slice(0, 160)}` })
    }
  }

  const failed = results.filter((r) => !r.ok).length
  await addLog(p._id, `Moved to ${stageTitle(to)}${failed ? ` (${failed} step${failed === 1 ? '' : 's'} failed)` : ''}`, 'stage')
  return results
}
