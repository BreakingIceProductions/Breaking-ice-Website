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

/** Shrunk previews kept in memory while the server stays warm, so a big file is only resized once. A file's contents never change under one id. */
const SHRUNK = new Map<string, Uint8Array>()
const remember = (id: string, img: Uint8Array) => {
  if (SHRUNK.size >= 24) SHRUNK.delete(SHRUNK.keys().next().value as string)
  SHRUNK.set(id, img)
}

/** Image types every browser can show as they are. */
const SHOWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'])
/** Largest original we'll send as its own preview. */
const PREVIEW_MAX = 30 * 1024 * 1024

/**
 * A preview image of a Drive file. Drive makes thumbnails for images, PDFs, Office files and some
 * design files, but only a while after upload and not for everything. When there isn't one and the
 * file is itself an image, the image is the preview.
 */
export async function googleThumbnail(url: string): Promise<Response | null> {
  const f = googleFile(url)
  if (!f || !driveReady()) return null
  try {
    const auth = { Authorization: `Bearer ${await accessToken()}` }
    const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?fields=thumbnailLink,mimeType,size&supportsAllDrives=true`, { headers: auth, cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
    if (!meta) return null
    if (meta.thumbnailLink) {
      const img = await fetch(String(meta.thumbnailLink).replace(/=s\d+$/, '=s1200'), { headers: auth, cache: 'no-store' })
      if (img.ok && img.body) return new Response(img.body, { headers: { 'Content-Type': img.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'private, max-age=600' } })
    }
    if (SHOWABLE.has(meta.mimeType) && Number(meta.size ?? 0) <= PREVIEW_MAX) {
      // The browser keeps it for a day: the file behind a version doesn't change.
      const cache = { 'Cache-Control': 'private, max-age=86400' }
      const kept = SHRUNK.get(f.id)
      if (kept) return new Response(kept, { headers: { 'Content-Type': 'image/webp', ...cache } })
      const file = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: auth, cache: 'no-store' })
      if (!file.ok) return null
      const original = Buffer.from(await file.arrayBuffer())
      // Small enough to show as it is.
      if (original.length <= 600 * 1024) return new Response(original, { headers: { 'Content-Type': meta.mimeType, ...cache } })
      // Print-size artwork can be tens of megabytes and hundreds of megapixels: shrink it to a screen-size preview.
      try {
        const sharp = (await import('sharp')).default
        const small = await sharp(original, { animated: false, sequentialRead: true, limitInputPixels: 1_500_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
        const out = new Uint8Array(small)
        remember(f.id, out)
        return new Response(out, { headers: { 'Content-Type': 'image/webp', ...cache } })
      } catch (e) {
        console.error('[portal] preview resize failed', e)
        return original.length <= 6 * 1024 * 1024 ? new Response(original, { headers: { 'Content-Type': meta.mimeType, ...cache } }) : null
      }
    }
    return null
  } catch (e) {
    console.error('[portal] thumbnail failed', e)
    return null
  }
}
