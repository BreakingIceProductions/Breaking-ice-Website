import { z } from 'zod'
import { adminFromRequest } from '@/admin/auth'
import { GoogleAuthError } from '@/admin/gcal'
import { attachmentUploadUrl, getConversation, listConversations, mailState, MailInputError, MailScopeError, markRead, outKeyOk, sendMail, unreadCount } from '@/admin/gmail'
import { isMailAddress } from '@/admin/mail-core'
import { MAIL_LIMITS } from '@/admin/mail-shared'
import { json } from '@/portal/http'
import { getSentEmail } from '@/portal/sent-emails'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The Emails page (client correspondence through Josh's Gmail). Owner only: view-only sign-ins can't read his mail.
 * GET: the conversation list, one client's conversation (?client=), the unread count for the sidebar (?count=1), or
 * the full copy of one email the site sent (?sent=<sentEmail id>, links taken out) for the card's preview sheet.
 * POST: mark a conversation read, get an upload address for a big attachment, or send.
 */

async function owner(req: Request) {
  const admin = await adminFromRequest(req)
  return admin && !admin.viewOnly ? admin : null
}

function failed(e: unknown) {
  if (e instanceof MailScopeError) return json({ ok: false, state: 'needs-scope', message: e.message }, 403)
  if (e instanceof GoogleAuthError) return json({ ok: false, state: 'signed-out', message: e.message }, 502)
  if (e instanceof MailInputError) return json({ ok: false, message: e.message }, 400)
  if (e instanceof z.ZodError) return json({ ok: false, message: 'Something in the email isn’t right. Check it and try again.' }, 400)
  console.error('[emails] failed', e)
  return json({ ok: false, message: 'Gmail didn’t answer. Try again in a moment.' }, 502)
}

const clientId = z.string().min(1).max(200).regex(/^[\w.-]+$/)

export async function GET(req: Request) {
  if (!(await owner(req))) return json({ ok: false, error: 'signed-out' }, 401)
  const u = new URL(req.url)
  try {
    if (u.searchParams.get('count')) return json({ ok: true, count: await unreadCount().catch(() => 0) })
    const sentId = u.searchParams.get('sent')
    if (sentId) {
      const email = await getSentEmail(sentId)
      return email ? json({ ok: true, email }) : json({ ok: false, message: 'That email isn’t on record any more.' }, 404)
    }
    const state = await mailState()
    if (state !== 'ready' && state !== 'sample') return json({ ok: true, state })
    const fresh = u.searchParams.get('fresh') === '1'
    const id = u.searchParams.get('client')
    if (id) {
      const conversation = await getConversation(clientId.parse(id), fresh)
      return conversation ? json({ ok: true, state, conversation }) : json({ ok: false, message: 'That client isn’t in the back office.' }, 404)
    }
    return json({ ok: true, state, rows: await listConversations(fresh) })
  } catch (e) {
    return failed(e)
  }
}

const address = z.string().trim().toLowerCase().max(254).refine(isMailAddress)
const msgId = z.string().max(320).regex(/^<[^<>\s]+>$/)
const file = z.object({
  name: z.string().min(1).max(200),
  type: z.string().max(120).regex(/^[\w.+-]+\/[\w.+-]+$|^$/),
  // Base64 for small files (under the inline limit in all), or the key of a file already uploaded to R2.
  data: z.string().max(Math.ceil((MAIL_LIMITS.inline * 4) / 3) + 8).regex(/^[A-Za-z0-9+/]*={0,2}$/).optional(),
  key: z.string().max(260).refine(outKeyOk).optional(),
  size: z.number().int().min(0).max(MAIL_LIMITS.files),
})

const send = z.object({
  action: z.literal('send'),
  clientId,
  to: z.array(address).min(1).max(MAIL_LIMITS.to),
  cc: z.array(address).max(MAIL_LIMITS.to).optional(),
  subject: z.string().trim().min(1).max(MAIL_LIMITS.subject),
  body: z.string().max(MAIL_LIMITS.body).refine((s) => s.trim().length > 0),
  threadId: z.string().regex(/^[0-9a-zA-Z_-]{1,64}$/).optional(),
  inReplyTo: msgId.optional(),
  references: z.string().max(4000).optional(),
  files: z.array(file).max(MAIL_LIMITS.fileCount),
})

export async function POST(req: Request) {
  if (!(await owner(req))) return json({ ok: false, error: 'signed-out' }, 401)
  const body = (await req.json().catch(() => null)) as { action?: string } | null
  try {
    const state = await mailState()
    if (state !== 'ready' && state !== 'sample') return json({ ok: false, state, message: 'Connect Google with email first.' }, 409)
    if (body?.action === 'read') return json({ ok: true, marked: await markRead(clientId.parse((body as { clientId?: string }).clientId)) })
    if (body?.action === 'upload') {
      const name = z.object({ name: z.string().min(1).max(200) }).parse(body).name
      return json({ ok: true, ...(state === 'sample' ? { key: `mail-out/${'0'.repeat(32)}/sample`, url: '', sample: true } : attachmentUploadUrl(name)) })
    }
    if (body?.action === 'send') {
      const input = send.parse(body)
      const total = input.files.reduce((n, f) => n + f.size, 0)
      if (total > MAIL_LIMITS.files) throw new MailInputError('Attachments are over 20 MB in all. Share big files with a link instead.')
      if (input.files.some((f) => !f.data && !f.key)) throw new MailInputError('An attachment didn’t come through. Attach it again.')
      const message = await sendMail({ ...input, files: input.files.map((f) => ({ name: f.name, type: f.type || 'application/octet-stream', data: f.data, key: f.key })) })
      return json({ ok: true, sample: state === 'sample' || undefined, message })
    }
    return json({ ok: false, message: 'Unknown action' }, 400)
  } catch (e) {
    return failed(e)
  }
}
