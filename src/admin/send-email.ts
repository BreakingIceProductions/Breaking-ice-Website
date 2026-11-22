import 'server-only'
import { addSentEmail, getProject, writeLog } from '@/admin/data'
import { resolveBlocks } from '@/admin/email-blocks'
import { LIMITS, parseRecipients } from '@/admin/email-templates-shared'
import type { OfficeProject } from '@/admin/types'
import { getPortalSettings } from '@/portal/data'
import { messageEmail, sendEmail } from '@/portal/email'

/**
 * Sends one email from a project, the one way the back office does it: the composer's Send
 * (src/app/api/admin/email/route.ts) and Slack's "Approve and send" (src/slack/run.ts) both call this.
 * Checks the recipients, subject, body and portal blocks; then Resend from Josh's address with a BCC to the
 * portal's copy-to address; then the "Emailed:" log line and the Emails sent record on the project.
 * Nothing is sent when any check fails, and nothing is sent in sample mode (`sample: true`, after the checks).
 * A failed log line or record after a good send comes back as `missed`, never as a failed send.
 */

export type SendProjectEmailInput = {
  projectId: string
  /** Comma/space separated text or a list, as the composer sends it. */
  to: string | string[]
  subject: string
  body: string
  /** The template it came from, kept on the sent record. */
  template?: string
  /** Sample mode: run every check, then send and record nothing. */
  sample?: boolean
}

export type SendProjectEmailError = 'not-found' | 'bad-to' | 'no-to' | 'too-many' | 'too-long' | 'no-subject' | 'no-body' | 'blocks' | 'email-off' | 'failed'

export type SendProjectEmailResult =
  | { ok: true; sample: true; project: OfficeProject; to: string[] }
  | { ok: true; sample?: false; project: OfficeProject; to: string[]; subject: string; missed: string[] }
  | { ok: false; error: SendProjectEmailError; status: number; message: string }

const fail = (error: SendProjectEmailError, status: number, message: string) => ({ ok: false as const, error, status, message })

export async function sendProjectEmail(input: SendProjectEmailInput): Promise<SendProjectEmailResult> {
  const subject = String(input.subject ?? '').replace(/\s+/g, ' ').trim()
  const body = String(input.body ?? '').replace(/\r\n?/g, '\n').trim()
  if (subject.length > LIMITS.subject || body.length > LIMITS.body)
    return fail('too-long', 400, `Keep the subject under ${LIMITS.subject} characters and the email under ${LIMITS.body.toLocaleString('en-CA')}.`)

  const p = await getProject(String(input.projectId ?? ''))
  if (!p) return fail('not-found', 404, 'That project isn’t there any more. Reload the page.')
  const { valid, invalid } = parseRecipients(input.to)
  if (invalid.length) return fail('bad-to', 400, `${invalid.join(', ')} doesn’t look like an email address.`)
  if (!valid.length) return fail('no-to', 400, 'Add who it’s to.')
  if (valid.length > LIMITS.to) return fail('too-many', 400, `Up to ${LIMITS.to} people per email.`)
  if (!subject) return fail('no-subject', 400, 'Add a subject.')
  if (!body) return fail('no-body', 400, 'The email is empty.')
  const template = typeof input.template === 'string' ? input.template.trim().slice(0, LIMITS.name) : ''
  const { sections, error: blockError } = await resolveBlocks(p, body)
  if (blockError) return fail('blocks', 400, `${blockError} Nothing was sent.`)

  if (input.sample) return { ok: true, sample: true, project: p, to: valid }

  const settings = await getPortalSettings()
  try {
    const r = await sendEmail({ to: valid, bcc: settings.copyTo && !valid.includes(settings.copyTo.toLowerCase()) ? [settings.copyTo] : undefined, ...messageEmail({ subject, body, sections }) })
    if (!r.ok) return fail('email-off', 503, 'Email isn’t set up on this site yet (no Resend key), so nothing was sent.')
  } catch (e) {
    console.error('[admin] email send failed', e)
    return fail('failed', 502, 'The email didn’t go out. Nothing was sent. Try again in a minute.')
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
  return { ok: true, project: p, to: valid, subject, missed }
}
