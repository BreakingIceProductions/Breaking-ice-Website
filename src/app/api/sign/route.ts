import { after } from 'next/server'
import { getSession } from '@/portal/auth'
import { getAccess } from '@/portal/data'
import { ipOf, json, limited, sameOrigin } from '@/portal/http'
import { afterSigning, signDocument } from '@/portal/sign-service'
import { findByToken, memoryMode } from '@/portal/sign-store'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * { token, name, values: { key: value }, forMinor, agree: true }
 * The token is the signer's private link. A client's document is only signed inside the
 * client portal, by one of that client's contacts; the session's address goes on the record.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const b = await req.json().catch(() => ({}))
  const token = typeof b.token === 'string' ? b.token : ''
  if (limited(`docsign:${ipOf(req)}`, 20, 60 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)
  const r = await findByToken(token)
  if (!r) return json({ ok: false, error: 'not-found' }, 404)

  let portalEmail: string | undefined
  if (r.audience === 'client') {
    const session = await getSession()
    if (!session) return json({ ok: false, error: 'signed-out' }, 401)
    if (session.preview) return json({ ok: false, error: 'preview' }, 403)
    // The portal's sample client only signs the sample documents kept in memory.
    if (session.demo && !memoryMode()) return json({ ok: true, demo: true })
    const access = await getAccess(session)
    if (!r.clientId || !access.clients.some((c) => c._id === r.clientId)) return json({ ok: false, error: 'not-found' }, 404)
    portalEmail = session.email
  }

  const res = await signDocument(r, {
    name: b.name,
    values: typeof b.values === 'object' && b.values ? b.values : {},
    forMinor: b.forMinor,
    agree: b.agree,
    ip: ipOf(req),
    userAgent: req.headers.get('user-agent') ?? 'unknown',
    portalEmail,
  })
  if (!res.ok) return json({ ok: false, error: res.error, field: 'field' in res ? res.field : undefined }, res.error === 'invalid' ? 400 : 409)
  after(() => afterSigning(r._id, res.pdf, res.filename).catch((e) => console.error('[sign] after signing failed', e)))
  return json({ ok: true, at: res.record.at, certificateId: res.record.certificateId })
}
