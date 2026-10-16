import { after } from 'next/server'
import { SITE_URL } from '@/lib/site'
import { normEmail, signLinkToken, startPending } from '@/portal/auth'
import { emailReady, portalReady } from '@/portal/config'
import { findClientsByEmail } from '@/portal/data'
import { sendEmail, signInEmail } from '@/portal/email'
import { ipOf, json, limited, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

/**
 * Always answers the same way whether or not the address is on a project,
 * so the form can't be used to find out who our clients are.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const body = await req.json().catch(() => ({}))
  const email = normEmail(String(body.email ?? '')).slice(0, 200)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'invalid' }, 400)
  if (limited(`ip:${ipOf(req)}`, 10, 15 * 60_000) || limited(`em:${email}`, 4, 15 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)
  // Checked before looking anyone up, so the answer never depends on who's a client.
  if (!portalReady() || !emailReady()) return json({ ok: false, error: 'not-configured' }, 503)

  const code = await startPending(email)
  // The lookup and email happen after we answer, so response time never hints at who's a client.
  after(async () => {
    const clients = await findClientsByEmail(email)
    if (!clients.length) return
    const next = typeof body.next === 'string' && body.next.startsWith('/portal/') ? body.next : '/portal'
    const link = `${SITE_URL}/portal/auth?token=${encodeURIComponent(await signLinkToken(email, next))}`
    try {
      await sendEmail({ to: [email], ...signInEmail({ link, code }) })
    } catch (e) {
      console.error('[portal] sign-in email failed', e)
    }
  })
  return json({ ok: true })
}
