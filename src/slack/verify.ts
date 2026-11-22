import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Slack request signatures (v0). Slack signs every request it sends with the app's signing secret:
 *   X-Slack-Signature: v0=hex(HMAC-SHA256(secret, "v0:{X-Slack-Request-Timestamp}:{raw body}"))
 * Requests older than five minutes are refused so a captured one can't be replayed.
 * No server-only import here, so the logic can be tested on its own.
 */

export const MAX_AGE_SECONDS = 5 * 60

export function signSlack(secret: string, timestamp: string, body: string) {
  return `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`
}

export function verifySlackSignature(input: { secret: string; timestamp: string | null; signature: string | null; body: string; nowMs?: number }): boolean {
  const { secret, timestamp, signature, body } = input
  if (!secret || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp) || !signature.startsWith('v0=')) return false
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000)
  if (Math.abs(now - Number(timestamp)) > MAX_AGE_SECONDS) return false
  const want = Buffer.from(signSlack(secret, timestamp, body))
  const got = Buffer.from(signature)
  return want.length === got.length && timingSafeEqual(want, got)
}

/** Reads the raw body (before any parsing) and checks its signature. */
export async function readSlackRequest(req: Request, secret: string): Promise<{ ok: true; body: string } | { ok: false }> {
  const body = await req.text()
  const ok = verifySlackSignature({ secret, timestamp: req.headers.get('x-slack-request-timestamp'), signature: req.headers.get('x-slack-signature'), body })
  return ok ? { ok: true, body } : { ok: false }
}
