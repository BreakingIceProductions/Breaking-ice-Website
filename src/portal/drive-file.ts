import 'server-only'
import { driveReady } from './config'
import { accessToken } from './drive'
import { downloadSource, googleFile } from './links'

/**
 * Hands a Google Drive file (or Doc) to the signed-in client through the portal.
 * Files the portal's Google account can see (anything in BI Clients) come through
 * privately; otherwise the public "Anyone with the link" download is tried.
 * Returns null when neither works, so the caller can fall back to the link itself.
 */
export async function streamGoogleFile(url: string, { inline = false, title = 'download' } = {}): Promise<Response | null> {
  const disposition = (name: string) => `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim() || 'download'
  const headersFor = (res: Response, name: string) => {
    const h = new Headers({
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': disposition(name),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    const len = res.headers.get('content-length')
    if (len) h.set('content-length', len)
    return h
  }

  const f = googleFile(url)
  if (f && driveReady()) {
    try {
      const auth = { Authorization: `Bearer ${await accessToken()}` }
      const base = `https://www.googleapis.com/drive/v3/files/${f.id}`
      const res = f.exportMime
        ? await fetch(`${base}/export?mimeType=${encodeURIComponent(f.exportMime)}`, { headers: auth, cache: 'no-store' })
        : await fetch(`${base}?alt=media&supportsAllDrives=true`, { headers: auth, cache: 'no-store' })
      if (res.ok && res.body) {
        // Drive's media response has no file name, so ask for it.
        const meta = await fetch(`${base}?fields=name&supportsAllDrives=true`, { headers: auth, cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        const name = meta?.name ? `${meta.name}${f.ext && !meta.name.endsWith(`.${f.ext}`) ? `.${f.ext}` : ''}` : `${safe(title)}${f.ext ? `.${f.ext}` : ''}`
        return new Response(res.body, { status: 200, headers: headersFor(res, name) })
      }
    } catch (e) {
      console.error('[portal] private Google fetch failed', e)
    }
  }

  const src = downloadSource(url)
  if (!src) return null
  try {
    const res = await fetch(src.fetchUrl, { redirect: 'follow', cache: 'no-store' })
    const type = res.headers.get('content-type') ?? ''
    // A web page instead of a file means Google wants a sign-in.
    if (!res.ok || !res.body || type.startsWith('text/html')) return null
    const given = res.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/)
    const name = given ? decodeURIComponent(given[1] ?? given[2]) : `${safe(title)}${src.ext ? `.${src.ext}` : ''}`
    return new Response(res.body, { status: 200, headers: headersFor(res, name) })
  } catch (e) {
    console.error('[portal] public Google fetch failed', e)
    return null
  }
}

/** A small preview image of a Drive file (Drive makes these for images, PDFs and design files). */
export async function googleThumbnail(url: string): Promise<Response | null> {
  const f = googleFile(url)
  if (!f || !driveReady()) return null
  try {
    const auth = { Authorization: `Bearer ${await accessToken()}` }
    const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?fields=thumbnailLink&supportsAllDrives=true`, { headers: auth, cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
    if (!meta?.thumbnailLink) return null
    const img = await fetch(String(meta.thumbnailLink).replace(/=s\d+$/, '=s800'), { headers: auth, cache: 'no-store' })
    if (!img.ok || !img.body) return null
    return new Response(img.body, { headers: { 'Content-Type': img.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'private, max-age=600' } })
  } catch (e) {
    console.error('[portal] thumbnail failed', e)
    return null
  }
}
