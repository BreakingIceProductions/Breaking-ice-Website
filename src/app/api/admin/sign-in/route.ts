import { after } from 'next/server'
import { SITE_URL } from '@/lib/site'
import { signAdminLink, startAdminPending } from '@/admin/auth'
import { isAdminEmail } from '@/admin/config'
import { normEmail } from '@/portal/auth'
import { emailReady, portalReady } from '@/portal/config'
import { adminSignInEmail, sendEmail } from '@/portal/email'
import { ipOf, json, limited, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

/** Answers the same way for every address, so the form never says who's an admin. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const body = await req.json().catch(() => ({}))
  const email = normEmail(String(body.email ?? '')).slice(0, 200)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'invalid' }, 400)
  if (limited(`admin-ip:${ipOf(req)}`, 10, 15 * 60_000) || limited(`admin-em:${email}`, 4, 15 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)
  if (!portalReady() || !emailReady()) return json({ ok: false, error: 'not-configured' }, 503)

  const code = await startAdminPending(email)
  after(async () => {
    if (!isAdminEmail(email)) return
    const link = `${SITE_URL}/admin/auth?token=${encodeURIComponent(await signAdminLink(email))}`
    try {
      await sendEmail({ to: [email], ...adminSignInEmail({ link, code }) })
    } catch (e) {
      console.error('[admin] sign-in email failed', e)
    }
  })
  return json({ ok: true })
}
