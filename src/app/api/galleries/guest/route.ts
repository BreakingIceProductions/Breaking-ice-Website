import { cleanEmail, cleanName, isDenied, resolveGallery, saveGuest } from '@/galleries/access'
import type { GalleryViewer } from '@/galleries/types'
import { ipOf, json, limited, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A share-link visitor gives their name (and maybe an email) so their favourites can be kept
 * and Josh knows whose picks they are. Stored in a signed cookie; nothing else is created here.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'bad-origin' }, 403)
  if (limited(`gal-guest:${ipOf(req)}`, 20, 10 * 60_000)) return json({ error: 'slow-down' }, 429)
  const body = (await req.json().catch(() => null)) as { slug?: unknown; name?: unknown; email?: unknown } | null
  const name = cleanName(body?.name)
  if (!name) return json({ error: 'name-needed' }, 400)

  const r = await resolveGallery('share', body?.slug, req)
  if (isDenied(r)) return json({ error: r.denied }, 404)

  const guest = await saveGuest(name, cleanEmail(body?.email) || undefined)
  const viewer: GalleryViewer = { kind: 'guest', name: guest.name, email: guest.email, canFavourite: true }
  return json({ ok: true, viewer })
}
