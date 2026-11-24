import { json } from '@/portal/http'
import { r2ThumbUrl } from '@/portal/r2'
import { playUrl, resolveReview } from '@/portal/review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The review copy's address, for someone allowed to watch it: a portal contact of the
 * client, the owner, or a switched-on share link. Valid about two hours; the room asks
 * again when it runs out.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const r = await resolveReview(req, { via: q.get('via'), project: q.get('project'), key: q.get('key'), token: q.get('token') })
  if (!r) return json({ ok: false }, 404)
  const url = playUrl(r.target)
  if (!url) return json({ ok: false, error: 'not-ready' }, 503)
  return json({ ok: true, url, poster: r2ThumbUrl(r.target.d.r2Thumb), expiresAt: new Date(Date.now() + 2 * 3600_000 - 60_000).toISOString() })
}
