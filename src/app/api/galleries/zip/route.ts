import { isDenied, resolveGallery, statsWho, zipSelection } from '@/galleries/access'
import { downloadName, readStream } from '@/galleries/files'
import { getFavourites, recordDownload } from '@/galleries/store'
import { uniqueNames, zipStream } from '@/galleries/zip'
import { json } from '@/portal/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const safePart = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Photos'

/** RFC 6266: a plain ASCII name for old browsers, the real one (accents and all) in filename*. */
function disposition(name: string) {
  const ascii = name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'gallery.zip'
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * "Download all": a whole gallery, one set, or the viewer's favourites, as zip parts of up to
 * ~2 GB each (ZIP_PART_BYTES) so every part finishes inside the time limit.
 *   ?plan=1    the parts list [{part, count, bytes}] for the dialog
 *   ?part=N    streams that part straight from storage, nothing buffered
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const size = q.get('size') === 'web' ? 'web' : q.get('size') === 'full' ? 'full' : null
  const scope = q.get('scope') || 'all'
  if (!size) return json({ error: 'bad-request' }, 400)

  const r = await resolveGallery(q.get('via'), q.get('ref'), req)
  if (isDenied(r)) return json({ error: r.denied }, 404)
  const g = r.gallery
  if (!g.downloads.all || !g.downloads[size]) return json({ error: 'not-allowed' }, 403)

  let favs: string[] = []
  if (scope === 'favourites') {
    if (!r.who || !r.viewer.canFavourite) return json({ error: 'name-needed' }, 403)
    favs = await getFavourites(g._id, r.who)
  } else if (scope !== 'all' && !g.sets.some((s) => s._key === scope)) {
    return json({ error: 'not-found' }, 404)
  }

  const parts = zipSelection(g, scope, size, favs)
  const bytesOf = (p: (typeof parts)[number][number]) => (size === 'web' ? p.webSize ?? p.size / 6 : p.size)

  if (q.get('plan')) {
    return json({ parts: parts.map((ps, i) => ({ part: i + 1, count: ps.length, bytes: Math.round(ps.reduce((n, p) => n + bytesOf(p), 0)) })) })
  }

  const n = Number(q.get('part'))
  if (!Number.isInteger(n) || n < 1 || n > parts.length) return json({ error: 'not-found' }, 404)
  const photos = parts[n - 1]

  // Whole gallery with several sets: one folder per set, named after it.
  const first = g.sets[0]?._key ?? ''
  const folders = scope === 'all' && g.sets.length > 1
  const setTitle = new Map(g.sets.map((s) => [s._key, safePart(s.title)]))
  const names = uniqueNames(photos.map((p) => {
    const file = downloadName(p, size).replace(/[\\/]/g, '-')
    return folders ? `${setTitle.get(p.set || first) ?? 'Photos'}/${file}` : file
  }))
  const kind = size === 'full' ? 'orig' : 'web'
  const entries = photos.map((p, i) => ({ name: names[i], open: () => readStream(g, p, kind) }))

  const scopeLabel = scope === 'all' ? 'All photos' : scope === 'favourites' ? 'Favourites' : g.sets.find((s) => s._key === scope)?.title ?? 'Photos'
  const partLabel = parts.length > 1 ? ` (part ${n} of ${parts.length})` : ''
  const fileName = `${safePart(g.title)} - ${safePart(scopeLabel)}${size === 'web' ? ' (web size)' : ''}${partLabel}.zip`

  const who = statsWho(r)
  if (!r.readOnly && who) {
    try {
      await recordDownload(g._id, who, { what: 'zip', size, ref: scope, label: `${scopeLabel}${partLabel}` })
    } catch (e) {
      console.error('[galleries] zip download not recorded', e)
    }
  }

  const stream = zipStream(entries, (e) => console.error('[galleries] zip part failed', g._id, scope, n, e))
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': disposition(fileName),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
