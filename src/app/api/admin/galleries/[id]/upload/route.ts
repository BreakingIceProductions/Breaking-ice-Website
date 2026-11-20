import { adminFromRequest } from '@/admin/auth'
import { KEY_RE, str } from '@/galleries/admin-input'
import { checkOriginal, driveOriginalsReady, setFolder, startOriginal } from '@/galleries/drive'
import { localFiles, storedSize, uploadUrl } from '@/galleries/files'
import { addPhotos, getGallery, newKey } from '@/galleries/store'
import { extOf, MAX_PHOTO_BYTES, PHOTO_TYPES, type GalleryPhoto } from '@/galleries/types'
import { json } from '@/portal/http'
import { r2Ready } from '@/portal/r2'

export const runtime = 'nodejs'

/**
 * The photo uploader's two calls. Files go straight from Josh's browser to storage, never through here:
 *   sign      → for up to 50 photos, a new key each and upload addresses: the web copy and thumbnail
 *               always go to R2; the original goes to Google Drive (a resumable upload address,
 *               galleries with originals: 'drive') or to R2 (the first galleries)
 *   register  → once a batch has landed, checks the files really are there and adds the photos to the gallery
 */

const MAX_BATCH = 50
const EXTS = ['jpg', 'png', 'webp']
const TYPE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const posInt = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v) : null)

/** Runs fn over items, n at a time. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const at = i++
        out[at] = await fn(items[at])
      }
    }),
  )
  return out
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  if (!localFiles() && !r2Ready()) return json({ ok: false, error: 'not-configured' }, 503)
  const body = await req.json().catch(() => ({}))
  const g = await getGallery(id)
  if (!g) return json({ ok: false, error: 'not-found' }, 404)
  // The made-up sample shoot shows pictures from /public, so new uploads to it would never appear.
  if (g.sample) return json({ ok: false, error: 'sample' }, 400)
  const toDrive = g.originals === 'drive'
  if (toDrive && !driveOriginalsReady()) return json({ ok: false, error: 'drive-not-configured' }, 503)

  if (body.action === 'sign') {
    const files = Array.isArray(body.files) ? (body.files as unknown[]) : null
    if (!files || !files.length || files.length > MAX_BATCH) return json({ ok: false, error: 'invalid' }, 400)
    const setKey = typeof body.set === 'string' && g.sets.some((x) => x._key === body.set) ? body.set : g.sets[0]?._key ?? ''
    let folder = ''
    if (toDrive) {
      try {
        folder = await setFolder(g, setKey)
      } catch (e) {
        console.error('[galleries] drive folder failed', e)
        return json({ ok: false, error: 'drive' }, 502)
      }
    }
    const origin = req.headers.get('origin') || new URL(req.url).origin
    const prepared = files.map((raw) => {
      const f = raw as { name?: unknown; type?: unknown; size?: unknown }
      const name = str(f?.name, 200) ?? ''
      const type = String(f?.type ?? '')
      const size = Number(f?.size)
      if (!name || !(PHOTO_TYPES as readonly string[]).includes(type)) return { ok: false as const, error: 'type' }
      if (!Number.isFinite(size) || size <= 0 || size > MAX_PHOTO_BYTES) return { ok: false as const, error: 'size' }
      const fromName = extOf(name)
      const ext = EXTS.includes(fromName) && TYPE_EXT[type] === fromName ? fromName : TYPE_EXT[type]
      const key = newKey()
      const p = { _key: key, ext }
      return { ok: true as const, key, ext, name, type, size, urls: { orig: toDrive ? '' : uploadUrl(g._id, p, 'orig'), web: uploadUrl(g._id, p, 'web'), thumb: uploadUrl(g._id, p, 'thumb') } }
    })
    // Drive upload addresses, a few at a time so Google doesn't throttle us.
    const items = await pool(prepared, 5, async (it) => {
      if (!it.ok || !toDrive) return it.ok ? { ok: true as const, key: it.key, ext: it.ext, urls: it.urls } : it
      try {
        const drive = await startOriginal(folder, { name: it.name, size: it.size, type: it.type }, origin)
        return { ok: true as const, key: it.key, ext: it.ext, urls: it.urls, drive }
      } catch (e) {
        console.error('[galleries] drive upload start failed', e)
        return { ok: false as const, error: 'drive' }
      }
    })
    return json({ ok: true, items })
  }

  if (body.action === 'register') {
    const raw = Array.isArray(body.photos) ? (body.photos as unknown[]) : null
    if (!raw || !raw.length || raw.length > MAX_BATCH) return json({ ok: false, error: 'invalid' }, 400)
    const have = new Set(g.photos.map((p) => p._key))
    const sets = new Set(g.sets.map((s) => s._key))
    const invalid: string[] = []
    const candidates: GalleryPhoto[] = []
    const now = new Date().toISOString()
    for (const r of raw) {
      const p = r as Record<string, unknown>
      const key = String(p?.key ?? '')
      const ext = String(p?.ext ?? '')
      const name = str(p?.name, 200)
      const w = posInt(p?.w, 100_000)
      const h = posInt(p?.h, 100_000)
      const size = posInt(p?.size, MAX_PHOTO_BYTES)
      if (!KEY_RE.test(key) || !EXTS.includes(ext) || !name || !w || !h || !size) {
        if (KEY_RE.test(key)) invalid.push(key)
        continue
      }
      if (have.has(key) || candidates.some((c) => c._key === key)) continue
      const set = typeof p.set === 'string' && sets.has(p.set) ? p.set : g.sets[0]?._key
      const driveId = toDrive && typeof p.driveId === 'string' && /^[\w-]{10,100}$/.test(p.driveId) ? p.driveId : undefined
      if (toDrive && !driveId) {
        invalid.push(key)
        continue
      }
      candidates.push({ _key: key, set, name, w, h, size, webSize: posInt(p?.webSize, MAX_PHOTO_BYTES) ?? undefined, ext, ...(driveId ? { driveId } : {}), uploadedAt: now })
    }
    // Only photos whose original and thumbnail actually landed get listed; the browser retries or reports the rest.
    const checked = await pool(candidates, 10, async (c): Promise<GalleryPhoto | null> => {
      const [orig, thumb, web] = await Promise.all([
        c.driveId ? checkOriginal(g, c.driveId).catch(() => null) : storedSize(g._id, c, 'orig'),
        storedSize(g._id, c, 'thumb'),
        storedSize(g._id, c, 'web'),
      ])
      return orig && thumb ? { ...c, size: orig, webSize: web || c.webSize } : null
    })
    const ready = checked.filter((c): c is GalleryPhoto => Boolean(c))
    const missing = candidates.filter((c) => !ready.some((r) => r._key === c._key)).map((c) => c._key)
    await addPhotos(g._id, ready)
    return json({ ok: true, added: ready.map((r) => r._key), missing: [...missing, ...invalid] })
  }

  return json({ ok: false, error: 'unknown-action' }, 404)
}
