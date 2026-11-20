import { adminFromRequest } from '@/admin/auth'
import { LIMITS } from '@/admin/email-templates-shared'
import { messageEmail } from '@/portal/email'
import { json } from '@/portal/http'
import { canWrite, getRetainerClient, getRetainerMonth, isMonthKey, monthKey, saveRecap } from '@/retainer/data'
import { draftRecap, sendRecap } from '@/retainer/recap'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * The month-end recap, from the back office.
 * { action: 'preview', subject, body }  branded HTML for the preview. Nothing is saved or sent.
 * { action: 'draft' }                   drafts it again from the month's data and saves the draft (not sent).
 * { action: 'save', subject, body }     saves Josh's edits.
 * { action: 'send', subject, body }     sends it, only when Josh presses Send (after a confirm step in the page).
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out', message: 'This sign-in can’t make changes or send email, or it has expired.' }, 401)
  const b = await req.json().catch(() => ({}))
  const subject = String(b.subject ?? '').replace(/\s+/g, ' ').trim()
  const body = String(b.body ?? '').replace(/\r\n?/g, '\n').trim()
  if (subject.length > LIMITS.subject || body.length > LIMITS.body) return json({ ok: false, error: 'too-long', message: `Keep the subject under ${LIMITS.subject} characters and the email under ${LIMITS.body.toLocaleString('en-CA')}.` }, 400)

  if (b.action === 'preview') return json({ ok: true, html: messageEmail({ subject: subject || '(No subject)', body: body || ' ' }).html })

  const month = String(b.month ?? '')
  if (!isMonthKey(month) || month >= monthKey()) return json({ ok: false, error: 'month', message: 'A recap is for a month that has ended.' }, 400)
  const c = await getRetainerClient(String(b.clientId ?? ''), { includeInactive: true })
  if (!c) return json({ ok: false, error: 'not-found', message: 'That client isn’t there any more. Reload the page.' }, 404)
  const sample = admin.sample || !canWrite(c._id)

  try {
    if (b.action === 'draft') {
      const existing = await getRetainerMonth(c._id, month)
      if (existing?.recap?.sentAt) return json({ ok: false, error: 'already-sent', message: 'This recap has already been sent.' }, 409)
      const d = await draftRecap(c, month)
      if (!sample) await saveRecap(c._id, month, { draftedAt: new Date().toISOString(), subject: d.subject, body: d.body })
      return json({ ok: true, subject: d.subject, body: d.body, ...(d.note ? { note: d.note } : {}), ...(sample ? { sample: true } : {}) })
    }
    if (!subject) return json({ ok: false, error: 'no-subject', message: 'Add a subject.' }, 400)
    if (!body) return json({ ok: false, error: 'no-body', message: 'The recap is empty.' }, 400)
    if (b.action === 'save') {
      const existing = await getRetainerMonth(c._id, month)
      if (existing?.recap?.sentAt) return json({ ok: false, error: 'already-sent', message: 'This recap has already been sent, so it can’t be changed.' }, 409)
      if (!sample) await saveRecap(c._id, month, { subject, body, ...(existing?.recap?.draftedAt ? {} : { draftedAt: new Date().toISOString() }) })
      return json({ ok: true, ...(sample ? { sample: true } : {}) })
    }
    if (b.action === 'send') {
      if (b.confirmed !== true) return json({ ok: false, error: 'confirm', message: 'Confirm before sending.' }, 400)
      if (sample) return json({ ok: true, sample: true, message: 'Sample mode: nothing was sent.' })
      const r = await sendRecap(c, month, { subject, body })
      if (!r.ok) return json(r, r.error === 'already-sent' || r.error === 'busy' ? 409 : r.error === 'email-off' ? 503 : 400)
      return json({ ok: true, message: `Sent to ${r.sent} of ${r.total}.${r.failed.length ? ` Didn’t reach: ${r.failed.map((f) => f.split(':')[0]).join(', ')}.` : ''}` })
    }
    return json({ ok: false, error: 'action' }, 400)
  } catch (e) {
    console.error('[retainer] recap failed', e)
    return json({ ok: false, error: 'failed', message: 'That didn’t work. Nothing was sent. Try again.' }, 502)
  }
}
