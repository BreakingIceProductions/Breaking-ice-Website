import { NextResponse } from 'next/server'
import { isDenied, resolveGallery, statsWho } from '@/galleries/access'
import { mimeOf, originalStream } from '@/galleries/drive'
import { downloadName, downloadUrl } from '@/galleries/files'
import { recordDownload } from '@/galleries/store'
import { json } from '@/portal/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * One photo: checks the viewer may download that size, notes it in the gallery's stats, then
 * sends the browser to a short-lived file address that saves under the photo's own name.
 * Originals kept in Google Drive are streamed through from Drive instead.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const size = q.get('size') === 'web' ? 'web' : q.get('size') === 'full' ? 'full' : null
  if (!size) return json({ error: 'bad-request' }, 400)

  const r = await resolveGallery(q.get('via'), q.get('ref'), req)
  if (isDenied(r)) return json({ error: r.denied }, 404)
  if (!r.gallery.downloads[size]) return json({ error: 'not-allowed' }, 403)
  const photo = r.gallery.photos.find((p) => p._key === q.get('key'))
  if (!photo) return json({ error: 'not-found' }, 404)

  const who = statsWho(r)
  if (!r.readOnly && who) {
    try {
      await recordDownload(r.gallery._id, who, { what: 'photo', size, ref: photo._key, label: downloadName(photo, size) })
    } catch (e) {
      console.error('[galleries] download not recorded', e)
    }
  }

  if (size === 'full' && photo.driveId) {
    const o = await originalStream(photo)
    if (!o) return json({ error: 'original-missing' }, 410)
    const name = downloadName(photo, size)
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
    return new Response(o.body, {
      headers: {
        'Content-Type': mimeOf(photo),
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        ...(o.size ? { 'Content-Length': String(o.size) } : {}),
        'Cache-Control': 'no-store',
      },
    })
  }

  // Sample galleries point at /public; real ones at a signed R2 (or local dev) address.
  const url = downloadUrl(r.gallery, photo, size)
  if (!url) return json({ error: 'unavailable' }, 503)
  return NextResponse.redirect(new URL(url, req.url), { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
