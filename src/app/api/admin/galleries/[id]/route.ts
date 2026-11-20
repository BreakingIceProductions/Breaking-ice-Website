import { adminFromRequest } from '@/admin/auth'
import { day, docId, KEY_RE, keyList, str } from '@/galleries/admin-input'
import { removePhotoFiles } from '@/galleries/files'
import { deleteGallery, getGallery, movePhotos, newKey, newSlug, removePhotos, reorderPhotos, setPassword, setSets, updateGallery, type GalleryPatch } from '@/galleries/store'
import type { Gallery, GalleryPhoto, GallerySet } from '@/galleries/types'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/**
 * Every change to one gallery from its back-office page, as { action, ... }:
 *   update          simple fields (title, dates, client, status, cover, message, downloads, share on/off)
 *   password        set (4+ characters) or clear the share password
 *   new-link        a fresh share address; the old one stops working
 *   sets            add, rename, reorder, remove sets (a set with photos needs { moveTo })
 *   move / reorder  photos between sets, or into a new order
 *   remove-photos   takes photos out and deletes their files
 *   delete-gallery  everything, once the title is typed to confirm
 */

const bad = (error = 'invalid') => json({ ok: false, error }, 400)

/** Removes files a few photos at a time, so a 1000-photo gallery doesn't open 3000 requests at once. */
async function removeFiles(g: Gallery, photos: GalleryPhoto[]) {
  if (g.sample) return
  for (let i = 0; i < photos.length; i += 10) await Promise.all(photos.slice(i, i + 10).map((p) => removePhotoFiles(g._id, p)))
}

/** Which set a photo is in: an empty set means the first one. */
const setOf = (g: Gallery, p: GalleryPhoto) => p.set || g.sets[0]?._key

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const g = await getGallery(id)
  if (!g) return json({ ok: false, error: 'not-found' }, 404)
  const action = String(body.action ?? '')

  if (action === 'update') {
    const patch: GalleryPatch = {}
    if ('title' in body) {
      const t = str(body.title, 140)
      if (!t) return bad()
      patch.title = t
    }
    for (const k of ['date', 'expiresOn'] as const) {
      if (!(k in body)) continue
      const v = day(body[k])
      if (v === undefined) return bad('bad-date')
      patch[k] = v
    }
    for (const k of ['clientId', 'projectId'] as const) {
      if (!(k in body)) continue
      const v = docId(body[k])
      if (v === undefined) return bad()
      patch[k] = v
    }
    if ('status' in body) {
      if (body.status !== 'draft' && body.status !== 'live') return bad()
      patch.status = body.status
    }
    if ('coverKey' in body) {
      const k = String(body.coverKey ?? '')
      if (!KEY_RE.test(k) || !g.photos.some((p) => p._key === k)) return bad()
      patch.coverKey = k
    }
    if ('message' in body) {
      const m = str(body.message ?? '', 1000)
      if (m === undefined) return bad()
      patch.message = m
    }
    if (body.downloads && typeof body.downloads === 'object') {
      const d: GalleryPatch['downloads'] = {}
      for (const k of ['full', 'web', 'all'] as const) if (typeof body.downloads[k] === 'boolean') d[k] = body.downloads[k]
      patch.downloads = d
    }
    if (typeof body.shareOn === 'boolean') patch.shareOn = body.shareOn
    if (!Object.keys(patch).length) return bad()
    await updateGallery(g._id, patch)
    return json({ ok: true })
  }

  if (action === 'password') {
    if (body.password === null || body.password === '') {
      await setPassword(g._id, null)
      return json({ ok: true, hasPassword: false })
    }
    const pw = typeof body.password === 'string' ? body.password.trim() : ''
    if (pw.length < 4) return bad('short')
    if (pw.length > 200) return bad('long')
    await setPassword(g._id, pw)
    return json({ ok: true, hasPassword: true })
  }

  if (action === 'new-link') {
    const slug = newSlug(g.title)
    await updateGallery(g._id, { slug })
    return json({ ok: true, slug })
  }

  if (action === 'sets') {
    const raw = Array.isArray(body.sets) ? (body.sets as unknown[]) : null
    if (!raw || !raw.length || raw.length > 50) return bad()
    const known = new Set(g.sets.map((s) => s._key))
    const next: GallerySet[] = []
    for (const r of raw) {
      const item = r as { _key?: unknown; title?: unknown }
      const title = str(item?.title, 80)
      if (!title) return bad('set-title')
      if (item._key !== undefined && item._key !== null && item._key !== '') {
        const k = String(item._key)
        if (!known.has(k) || next.some((s) => s._key === k)) return bad()
        next.push({ _key: k, title })
      } else next.push({ _key: newKey(), title })
    }
    const keep = new Set(next.map((s) => s._key))
    const removed = g.sets.filter((s) => !keep.has(s._key)).map((s) => s._key)
    // Photos with no set belong to whichever set is first; pin them down before the order changes.
    const loose = g.photos.filter((p) => !p.set).map((p) => p._key)
    if (loose.length && g.sets[0]) await movePhotos(g._id, loose, g.sets[0]._key)
    const orphans = g.photos.filter((p) => removed.includes(setOf(g, p))).map((p) => p._key)
    if (orphans.length) {
      const moveTo = String(body.moveTo ?? '')
      if (!moveTo || !keep.has(moveTo) || !known.has(moveTo)) return json({ ok: false, error: 'set-not-empty', count: orphans.length }, 409)
      await movePhotos(g._id, orphans, moveTo)
    }
    await setSets(g._id, next)
    return json({ ok: true, sets: next })
  }

  if (action === 'move') {
    const keys = keyList(body.keys)
    const set = String(body.set ?? '')
    if (!keys || !g.sets.some((s) => s._key === set)) return bad()
    await movePhotos(g._id, keys.filter((k) => g.photos.some((p) => p._key === k)), set)
    return json({ ok: true })
  }

  if (action === 'reorder') {
    const keys = keyList(body.keys, 20_000)
    if (!keys) return bad()
    await reorderPhotos(g._id, keys)
    return json({ ok: true })
  }

  if (action === 'remove-photos') {
    const keys = keyList(body.keys)
    if (!keys) return bad()
    const gone = g.photos.filter((p) => keys.includes(p._key))
    if (!gone.length) return json({ ok: true, removed: 0 })
    await removePhotos(g._id, gone.map((p) => p._key))
    // The record no longer lists them, so a failed file delete can only leave a stray file, never a broken photo.
    await removeFiles(g, gone)
    if (g.coverKey && keys.includes(g.coverKey)) {
      const next = g.photos.find((p) => !keys.includes(p._key))
      await updateGallery(g._id, { coverKey: next?._key ?? '' })
    }
    return json({ ok: true, removed: gone.length })
  }

  if (action === 'delete-gallery') {
    if (str(body.confirm, 200) !== g.title.trim()) return bad('confirm')
    await removeFiles(g, g.photos)
    await deleteGallery(g._id)
    return json({ ok: true })
  }

  return json({ ok: false, error: 'unknown-action' }, 404)
}
