import { after } from 'next/server'
import { acceptSuggestion, dismissSuggestion, SuggestionError } from '@/admin/capture'
import { SITE_URL } from '@/lib/site'
import { canWrite, getRetainerClient, getRetainerMonth, isMonthKey, monthKey, monthLabel } from '@/retainer/data'
import { sendRecap } from '@/retainer/recap'
import { respond, updateMessage } from '@/slack/api'
import { context, slackEsc, type SlackBlock } from '@/slack/blocks'
import { slackChatReady, slackEnv } from '@/slack/env'
import { claimPending, finishPending, PendingError } from '@/slack/pending'
import { runPending, type RunOutcome } from '@/slack/run'
import { readSlackRequest } from '@/slack/verify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Slack interactivity: the buttons on the back office's messages. Every request's signature is checked
 * and only Josh (SLACK_OWNER_ID) can press them. The message's buttons are taken off before Slack gets
 * its 200, so a second tap can't run anything twice; the work runs afterwards and the message is
 * updated with how it went. Pending changes are also claimed atomically (src/slack/pending.ts), and a
 * recap send is claimed by sendRecap itself.
 */

type Payload = {
  type?: string
  user?: { id?: string }
  channel?: { id?: string }
  container?: { message_ts?: string }
  message?: { ts?: string; text?: string; blocks?: SlackBlock[] }
  response_url?: string
  actions?: { action_id?: string; value?: string }[]
}

const ok = () => new Response(null, { status: 200 })
const busy = new Set<string>()
const link = (path: string, label: string) => `<${SITE_URL}${path}|${slackEsc(label)}>`

async function act(actionId: string, value: string): Promise<RunOutcome & { restore?: boolean }> {
  switch (actionId) {
    case 'sugg_accept': {
      try {
        const r = await acceptSuggestion(value)
        if (!r.id) return { ok: true, message: 'Sample mode: nothing was added.' }
        return r.existing
          ? { ok: true, message: `Accepted. That address already belongs to ${link(r.href, 'this record')}, so it was logged there instead.` }
          : { ok: true, message: `Accepted. Lead created: ${link(r.href, 'open the lead')}.` }
      } catch (e) {
        if (e instanceof SuggestionError) return { ok: false, message: slackEsc(e.message.replace(' Reload the page.', '')) }
        throw e
      }
    }
    case 'sugg_dismiss': {
      try {
        await dismissSuggestion(value)
        return { ok: true, message: 'Dismissed.' }
      } catch (e) {
        if (e instanceof SuggestionError) return { ok: false, message: slackEsc(e.message.replace(' Reload the page.', '')) }
        throw e
      }
    }
    case 'recap_send': {
      const [clientId = '', month = ''] = value.split('|')
      if (!isMonthKey(month) || month >= monthKey()) return { ok: false, message: 'That recap button isn’t valid.' }
      const c = await getRetainerClient(clientId, { includeInactive: true })
      if (!c) return { ok: false, message: 'That client isn’t there any more.' }
      const page = link(`/admin/retainers/${encodeURIComponent(c._id)}?month=${month}`, 'Open the recap')
      if (!canWrite(c._id)) return { ok: true, message: 'Sample mode: nothing was sent.' }
      const recap = (await getRetainerMonth(c._id, month))?.recap
      if (recap?.sentAt) return { ok: false, message: `Already sent. ${page}` }
      if (!recap?.subject || !recap.body) return { ok: false, message: `There’s no saved draft to send. ${page}` }
      // The saved draft as it is now, so edits made in the back office since the ping are what goes out.
      const r = await sendRecap(c, month, { subject: recap.subject, body: recap.body })
      if (!r.ok) return { ok: false, message: `${slackEsc(r.message)} ${page}`, restore: r.error === 'busy' || r.error === 'failed' }
      return {
        ok: true,
        message: `${slackEsc(c.organizationName)} ${monthLabel(month)} recap sent to ${r.sent} of ${r.total}.${r.failed.length ? ` Didn’t reach: ${slackEsc(r.failed.map((f) => f.split(':')[0]).join(', '))}.` : ''}`,
      }
    }
    case 'pending_confirm': {
      let entry
      try {
        entry = await claimPending(value, 'running')
      } catch (e) {
        if (e instanceof PendingError) return { ok: false, message: slackEsc(e.message) }
        throw e
      }
      let out: RunOutcome
      try {
        out = await runPending(entry.action)
      } catch (e) {
        console.error('[slack] pending run failed', e)
        out = { ok: false, message: 'That didn’t work. Check the back office before trying again.' }
      }
      await finishPending(value, `${out.ok ? 'done' : 'failed'}: ${out.message}`)
      return out
    }
    case 'pending_cancel': {
      try {
        const entry = await claimPending(value, 'cancelled')
        return { ok: true, message: entry.action.kind === 'send_email' ? 'Discarded. Nothing was sent.' : 'Cancelled. Nothing was changed.' }
      } catch (e) {
        if (e instanceof PendingError) return { ok: false, message: slackEsc(e.message) }
        throw e
      }
    }
  }
  return { ok: false, message: 'That button isn’t one I know.' }
}

export async function POST(req: Request) {
  if (!slackChatReady()) return new Response('Slack is not set up.', { status: 503 })
  const r = await readSlackRequest(req, slackEnv.signingSecret)
  if (!r.ok) return new Response('Bad signature.', { status: 401 })
  let p: Payload
  try {
    p = JSON.parse(new URLSearchParams(r.body).get('payload') ?? '')
  } catch {
    return new Response('Bad request.', { status: 400 })
  }
  if (p.type !== 'block_actions') return ok()
  const action = p.actions?.[0]
  const actionId = action?.action_id ?? ''
  if (!action || actionId === 'open') return ok() // link buttons open in the browser; nothing to do here
  if (p.user?.id !== slackEnv.ownerId) {
    if (p.response_url) after(() => respond(p.response_url!, { response_type: 'ephemeral', replace_original: false, text: 'Only Josh can use these buttons.' }))
    return ok()
  }

  const channel = p.channel?.id ?? ''
  const ts = p.container?.message_ts ?? p.message?.ts ?? ''
  const lockKey = `${channel}:${ts}`
  if (!channel || !ts || busy.has(lockKey)) return ok()
  busy.add(lockKey)

  const original = p.message?.blocks ?? []
  const kept = original.filter((b) => b.type !== 'actions')
  const fallback = p.message?.text ?? 'Back office'
  const show = (line: string, blocks = [...kept, context(line)]) => updateMessage({ channel, ts, text: `${fallback}\n${line}`.slice(0, 3000), blocks })

  // Buttons off before Slack hears back, so nothing can be tapped twice.
  await show('Working on it…')
  after(async () => {
    try {
      const out = await act(actionId, String(action.value ?? ''))
      if (out.restore) await show(out.message, [...original, context(out.message)])
      else await show(out.message)
    } catch (e) {
      console.error('[slack] button failed', actionId, e)
      // Nothing was claimed or it failed before acting: put the buttons back so it can be tried again.
      await show('That didn’t work. Try again, or use the back office.', [...original, context('That didn’t work. Try again, or use the back office.')])
    } finally {
      busy.delete(lockKey)
    }
  })
  return ok()
}
