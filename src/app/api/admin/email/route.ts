import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { resolveBlocks } from '@/admin/email-blocks'
import { blockTokens } from '@/admin/email-blocks-shared'
import { LIMITS } from '@/admin/email-templates-shared'
import { sendProjectEmail } from '@/admin/send-email'
import { messageEmail } from '@/portal/email'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/**
 * The email composer on the lead and project pages.
 * { action: 'preview', projectId?, subject, body } returns the branded HTML, for the live preview. Nothing is sent.
 * { projectId, to, subject, body, template? } sends it, only ever when Josh presses Send: through Resend,
 *   from Josh's address with replies to Josh, then logs it on the project and keeps a copy on its office record.
 * Portal blocks ([[block:…]] lines) are filled from the project's real data for both, and a token the project
 * can't fill stops the preview and the send with a message, so it's never sent as raw text.
 * The sent record keeps the body with its tokens. The send itself is sendProjectEmail (src/admin/send-email.ts),
 * shared with Slack's "Approve and send".
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

  const r = await sendProjectEmail({
    projectId: String(b.projectId ?? ''),
    to: Array.isArray(b.to) ? b.to.map(String) : String(b.to ?? ''),
    subject,
    body,
    template: typeof b.template === 'string' ? b.template : undefined,
    sample: admin.sample,
  })
  if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, r.status)
  if (r.sample) return json({ ok: true, sample: true })
  return json({ ok: true, ...(r.missed.length ? { warning: `Sent, but it couldn’t be added to the ${r.missed.join(' or the ')}.` } : {}) })
}
