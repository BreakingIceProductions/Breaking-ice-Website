import 'server-only'
import { addSuggestion } from '@/admin/capture'
import { adminSampleMode } from '@/admin/config'
import { addNote, createLead, getProject, writeLog } from '@/admin/data'
import { today } from '@/admin/dates'
import { cleanLeadPatch, CONTACT_KINDS, pageHref } from '@/admin/lead'
import { sendProjectEmail } from '@/admin/send-email'
import { planStage, runStage, stageTitle } from '@/admin/stages'
import { SITE_URL } from '@/lib/site'
import { PIPELINE_STAGES, PROJECT_TYPES, type PipelineStage } from '@/sanity/portal/office-constants'
import { slackEsc } from './blocks'
import type { PendingAction } from './pending'

/**
 * What a Confirm (or "Approve and send") tap runs. Every change goes through the same server functions
 * the back office's own pages use. Returns a short line for the Slack message (mrkdwn, escaped).
 */

export type RunOutcome = { ok: boolean; message: string }

const link = (path: string, label: string) => `<${SITE_URL}${path}|${slackEsc(label)}>`

export async function runPending(a: PendingAction): Promise<RunOutcome> {
  if (adminSampleMode()) return { ok: true, message: 'Sample mode: nothing was changed or sent.' }
  switch (a.kind) {
    case 'log_contact': {
      const p = await getProject(a.projectId)
      if (!p) return { ok: false, message: 'That project isn’t there any more. Nothing was logged.' }
      const kind = CONTACT_KINDS.find((k) => k.value === a.contactKind)
      if (!kind || !/^\d{4}-\d{2}-\d{2}$/.test(a.date) || a.date > today()) return { ok: false, message: 'Something in that log line wasn’t right. Nothing was logged.' }
      // The same line, kind and date handling as "Log contact" on the lead page.
      await writeLog(p._id, a.note ? `${kind.title}: ${a.note}` : kind.title, `contact-${kind.value}`, a.date === today() ? undefined : { at: `${a.date}T19:00:00.000Z`, day: true })
      return { ok: true, message: `Logged on ${link(pageHref(p._id, p.pipelineStage), p.title)}.` }
    }
    case 'add_note': {
      const p = await getProject(a.projectId)
      if (!p) return { ok: false, message: 'That project isn’t there any more. Nothing was saved.' }
      await addNote(p._id, a.text)
      return { ok: true, message: `Note added to ${link(pageHref(p._id, p.pipelineStage), p.title)}.` }
    }
    case 'move_stage': {
      const p = await getProject(a.projectId)
      if (!p) return { ok: false, message: 'That project isn’t there any more. Nothing was moved.' }
      if (!PIPELINE_STAGES.some((s) => s.value === a.to)) return { ok: false, message: 'That stage isn’t one the back office knows. Nothing was moved.' }
      if (p.pipelineStage !== a.from)
        return { ok: false, message: `It’s in ${stageTitle(p.pipelineStage)} now, not ${stageTitle(a.from)} as when I asked. Nothing was moved; ask me again.` }
      // Only the steps Josh was shown run: anything new in the plan since then is skipped.
      const plan = await planStage(p, a.to as PipelineStage)
      const skip = plan.actions.map((x) => x.id).filter((id) => id !== 'stage' && !a.actionIds.includes(id))
      const results = await runStage(p, a.to as PipelineStage, skip)
      const failed = results.filter((r) => !r.ok)
      const href = pageHref(p._id, a.to)
      return {
        ok: !failed.length,
        message: `${link(href, p.title)} moved to ${stageTitle(a.to)}.${failed.length ? ` Didn’t work: ${failed.map((f) => slackEsc(f.message)).join('; ')}.` : ''}`,
      }
    }
    case 'create_lead': {
      const lead = cleanLeadPatch({ ...(a.notes && { notes: a.notes }), ...(a.source && { source: a.source }) })
      if (!lead || !a.name || !a.company) return { ok: false, message: 'Something in that lead wasn’t right. Nothing was added.' }
      const made = await createLead({
        name: a.name,
        email: a.email,
        company: a.company,
        title: a.title,
        projectType: a.projectType && PROJECT_TYPES.some((t) => t.value === a.projectType) ? a.projectType : undefined,
        lead,
      })
      await writeLog(made.id, 'Added from Slack', 'lead').catch((e) => console.error('[slack] lead log line failed', e))
      return { ok: true, message: `Lead created: ${link(pageHref(made.id, 'lead'), a.title)}${made.newClient ? ' (new client)' : ''}.` }
    }
    case 'add_suggestion': {
      const added = await addSuggestion({ source: 'manual', name: a.name, email: a.email, company: a.company, summary: a.summary })
      return added
        ? { ok: true, message: `Added to the suggestions on ${link('/admin', 'Today')}.` }
        : { ok: false, message: 'Not added: it’s already waiting, or that address already belongs to a client or a lead.' }
    }
    case 'send_email':
      return sendProjectEmailFromSlack(a)
  }
}

/**
 * The composer's send (sendProjectEmail, shared with src/app/api/admin/email/route.ts): the same checks,
 * Resend from Josh's address with a BCC to the portal's copy-to address, then the "Emailed:" log line and the
 * Emails sent record. Only the wording of a refusal is Slack's own.
 */
async function sendProjectEmailFromSlack(a: Extract<PendingAction, { kind: 'send_email' }>): Promise<RunOutcome> {
  const r = await sendProjectEmail({ projectId: a.projectId, to: a.to, subject: a.subject, body: a.body })
  if (!r.ok) {
    switch (r.error) {
      case 'not-found':
        return { ok: false, message: 'That project isn’t there any more. Nothing was sent.' }
      case 'bad-to':
      case 'no-to':
      case 'too-many':
        return { ok: false, message: 'The recipients weren’t right. Nothing was sent.' }
      case 'too-long':
      case 'no-subject':
      case 'no-body':
        return { ok: false, message: 'The subject or email was empty or too long. Nothing was sent.' }
      default:
        return { ok: false, message: slackEsc(r.message) }
    }
  }
  if (r.sample) return { ok: true, message: 'Sample mode: nothing was changed or sent.' }
  const p = r.project
  return {
    ok: true,
    message: `Sent to ${slackEsc(r.to.join(', '))}. Logged on ${link(pageHref(p._id, p.pipelineStage), p.title)}.${r.missed.length ? ` (Couldn’t add it to the ${r.missed.join(' or the ')}.)` : ''}`,
  }
}
