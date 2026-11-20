import { isDenied, resolveGallery } from '@/galleries/access'
import { setFavourite } from '@/galleries/store'
import { json, limited, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Hearts a photo (or takes the heart off) for whoever is looking.
 * Guests without a name get 403 'name-needed', so the gallery can ask for one and try again.
 * Previews and read-only samples answer ok without saving, so the heart still feels right.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'bad-origin' }, 403)
  const body = (await req.json().catch(() => null)) as { via?: unknown; ref?: unknown; key?: unknown; on?: unknown } | null
  if (!body || typeof body.key !== 'string') return json({ error: 'bad-request' }, 400)

  const r = await resolveGallery(body.via, body.ref, req)
  if (isDenied(r)) return json({ error: r.denied }, 404)
  if (!r.viewer.canFavourite || !r.who) return json({ error: r.viewer.kind === 'guest' ? 'name-needed' : 'read-only' }, 403)
  if (!r.gallery.photos.some((p) => p._key === body.key)) return json({ error: 'not-found' }, 404)
  if (limited(`gal-fav:${r.gallery._id}:${r.who.id}`, 240, 60_000)) return json({ error: 'slow-down' }, 429)
  if (r.readOnly) return json({ ok: true, saved: false })

  try {
    await setFavourite(r.gallery._id, r.who, body.key, body.on !== false)
  } catch (e) {
    console.error('[galleries] favourite not saved', e)
    return json({ error: 'not-saved' }, 500)
  }
  return json({ ok: true, saved: true })
}
