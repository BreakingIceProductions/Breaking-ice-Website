import { createHmac, timingSafeEqual } from 'node:crypto'
import { recordEmailEvent, type EmailEvent } from '@/admin/data'
import { recordSentEmailEvent } from '@/portal/sent-emails'

export const runtime = 'nodejs'

/** How old a signed delivery may be, either way, before it's refused (Svix's own default). */
const TOLERANCE_S = 5 * 60

/**
 * Checks a Resend (Svix) signature: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<raw body>", keyed with the
 * base64 part of the whsec_ secret, compared against each "v1,<base64>" entry in svix-signature.
 */
function verifyResend(payload: string, h: { id: string | null; timestamp: string | null; signature: string | null }, secret: string, now = Date.now()) {
  if (!h.id || !h.timestamp || !h.signature) return false
  const ts = Number(h.timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_S) return false
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
  if (!key.length) return false
  const expected = createHmac('sha256', key).update(`${h.id}.${h.timestamp}.${payload}`).digest()
  return h.signature.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

type ResendEvent = { type?: string; created_at?: string; data?: { email_id?: string; created_at?: string; bounce?: { message?: string; type?: string; subType?: string } } }

const KINDS: Record<string, EmailEvent['kind']> = { 'email.opened': 'opened', 'email.delivered': 'delivered', 'email.bounced': 'bounced' }

/**
 * Resend → us: opens, deliveries and bounces, matched by Resend id on two records: the project's "Emails sent"
 * list (the back office composer and Slack's "Approve and send") and the `sentEmail` copy every client email
 * from the site keeps (src/portal/sent-emails.ts), which drives the cards on the Emails page. One email can have
 * both. Other events, and emails with no record, are answered 200 and ignored so Resend doesn't retry them.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!secret) {
    console.error('[resend] webhook called but RESEND_WEBHOOK_SECRET is not set; add the signing secret from Resend to the environment')
    return new Response('webhook not configured', { status: 503 })
  }
  const payload = await req.text()
  const hookId = req.headers.get('svix-id')
  if (!verifyResend(payload, { id: hookId, timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') }, secret))
    return new Response('bad signature', { status: 400 })

  let event: ResendEvent
  try {
    event = JSON.parse(payload) as ResendEvent
  } catch {
    return new Response('bad payload', { status: 400 })
  }
  const kind = KINDS[event.type ?? '']
  const resendId = event.data?.email_id
  if (!kind || !resendId) return new Response('ignored')

  const at = event.created_at && !Number.isNaN(Date.parse(event.created_at)) ? new Date(event.created_at).toISOString() : new Date().toISOString()
  const b = event.data?.bounce
  try {
    const e: EmailEvent = { kind, resendId, at, hookId: hookId!, ...(kind === 'bounced' && b ? { bounce: b.message || [b.type, b.subType].filter(Boolean).join(' · ') } : {}) }
    const [project, copy] = await Promise.all([recordEmailEvent(e), recordSentEmailEvent(e)])
    if (!project.found && !copy.found) return new Response('no record')
  } catch (e) {
    console.error('[resend] webhook failed', e)
    return new Response('retry', { status: 500 })
  }
  return new Response('ok')
}
