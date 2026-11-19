import { adminFromRequest } from '@/admin/auth'
import { addSentEmail, getProject, writeLog } from '@/admin/data'
import { resolveBlocks } from '@/admin/email-blocks'
import { blockTokens } from '@/admin/email-blocks-shared'
import { LIMITS, parseRecipients } from '@/admin/email-templates-shared'
import { getPortalSettings } from '@/portal/data'
import { messageEmail, sendEmail } from '@/portal/email'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/**
 * The email composer on the lead and project pages.
 * { action: 'preview', projectId?, subject, body } returns the branded HTML, for the live preview. Nothing is sent.
 * { projectId, to, subject, body, template? } sends it, only ever when Josh presses Send: through Resend,
 *   from Josh's address with replies to Josh, then logs it on the project and keeps a copy on its office record.
 * Portal blocks ([[block:…]] lines) are filled from the project's real data for both, and a token the project
 * can't fill stops the preview and the send with a message, so it's never sent as raw text.
 * The sent record keeps the body with its tokens.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out', message: 'This sign-in can’t send email, or it has expired.' }, 401)
  const b = await req.json().catch(() => ({}))
  const subject = String(b.subject ?? '').replace(/\s+/g, ' ').trim()
  const body = String(b.body ?? '').replace(/\r\n?/g, '\n').trim()
  if (subject.length > LIMITS.subject || body.length > LIMITS.body) return json({ ok: false, error: 'too-long', message: `Keep the subject under ${LIMITS.subject} characters and the email under ${LIMITS.body.toLocaleString('en-CA')}.` }, 400)

  if (b.action === 'preview') {
    if (!blockTokens(body).length) return json({ ok: true, html: messageEmail({ subject: subject || '(No subject)', body: body || ' ' }).html })
    const project = b.projectId ? await getProject(String(b.projectId)) : null
    const { sections, error } = await resolveBlocks(project, body)
    if (error) return json({ ok: false, error: 'blocks', message: error }, 400)
    return json({ ok: true, html: messageEmail({ subject: subject || '(No subject)', body, sections }).html })
  }

  const p = await getProject(String(b.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found', message: 'That project isn’t there any more. Reload the page.' }, 404)
  const { valid, invalid } = parseRecipients(Array.isArray(b.to) ? b.to.map(String) : String(b.to ?? ''))
  if (invalid.length) return json({ ok: false, error: 'bad-to', message: `${invalid.join(', ')} doesn’t look like an email address.` }, 400)
  if (!valid.length) return json({ ok: false, error: 'no-to', message: 'Add who it’s to.' }, 400)
  if (valid.length > LIMITS.to) return json({ ok: false, error: 'too-many', message: `Up to ${LIMITS.to} people per email.` }, 400)
  if (!subject) return json({ ok: false, error: 'no-subject', message: 'Add a subject.' }, 400)
  if (!body) return json({ ok: false, error: 'no-body', message: 'The email is empty.' }, 400)
  const template = typeof b.template === 'string' ? b.template.trim().slice(0, LIMITS.name) : ''
  const { sections, error: blockError } = await resolveBlocks(p, body)
  if (blockError) return json({ ok: false, error: 'blocks', message: `${blockError} Nothing was sent.` }, 400)

  if (admin.sample) return json({ ok: true, sample: true })

  const settings = await getPortalSettings()
  try {
    const r = await sendEmail({ to: valid, bcc: settings.copyTo && !valid.includes(settings.copyTo.toLowerCase()) ? [settings.copyTo] : undefined, ...messageEmail({ subject, body, sections }) })
    if (!r.ok) return json({ ok: false, error: 'email-off', message: 'Email isn’t set up on this site yet (no Resend key), so nothing was sent.' }, 503)
  } catch (e) {
    console.error('[admin] email send failed', e)
    return json({ ok: false, error: 'failed', message: 'The email didn’t go out. Nothing was sent. Try again in a minute.' }, 502)
  }

  // It's gone, so a failed record mustn't read as a failed send.
  const at = new Date().toISOString()
  const missed: string[] = []
  await writeLog(p._id, `Emailed: ${subject}`.slice(0, 240), 'email').catch((e) => {
    console.error('[admin] email log failed', e)
    missed.push('activity log')
  })
  await addSentEmail(p._id, { at, to: valid, subject, body, ...(template ? { template } : {}) }).catch((e) => {
    console.error('[admin] sent email record failed', e)
    missed.push('Emails sent list')
  })
  return json({ ok: true, ...(missed.length ? { warning: `Sent, but it couldn’t be added to the ${missed.join(' or the ')}.` } : {}) })
}
