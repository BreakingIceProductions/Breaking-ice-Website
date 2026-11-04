import { adminFromRequest } from '@/admin/auth'
import { portalEnv } from '@/portal/config'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** Back-office diagnostic: what Vimeo says about a video's review page. */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const id = new URL(req.url).searchParams.get('id')?.replace(/\D/g, '')
  if (!id) return json({ ok: false, error: 'id' }, 400)
  const r = await fetch(`https://api.vimeo.com/videos/${id}?fields=link,review_page,privacy.view,metadata.connections.versions`, {
    headers: { Authorization: `Bearer ${portalEnv.vimeoToken}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' },
    cache: 'no-store',
  })
  return json({ ok: r.ok, status: r.status, video: await r.json().catch(() => null) })
}
