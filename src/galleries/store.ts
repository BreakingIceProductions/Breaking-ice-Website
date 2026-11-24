import 'server-only'
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { adminSampleMode } from '@/admin/config'
import { portalClient } from '@/portal/data'
import { portalReady } from '@/portal/config'
import { sampleGallery } from './samples'
import { galleryClientIds, type DownloadEvent, type FavouriteList, type Gallery, type GalleryDownloads, type GalleryPhoto, type GallerySet, type ViewerKind, type Visit } from './types'

/**
 * Gallery records. Real ones are documents in the private portal dataset:
 *   gallery              one per shoot (sets, photos, sharing, expiry)
 *   galleryFav           one per gallery + viewer: their favourite photo keys
 *   galleryVisit         one per gallery + viewer: views and downloads
 * Without portal settings (local development) everything lives in memory instead, starting
 * with one sample shoot, so every screen and the uploader can be tried on a laptop.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>

export const useMemory = () => !portalReady()

type Mem = { galleries: Map<string, Gallery>; favs: Map<string, FavouriteList & { gallery: string }>; visits: Map<string, Visit & { gallery: string }> }
const g = globalThis as unknown as { __biGalleries?: Mem }
function mem(): Mem {
  if (!g.__biGalleries) {
    const s = sampleGallery()
    g.__biGalleries = { galleries: new Map([[s._id, s]]), favs: new Map(), visits: new Map() }
  }
  return g.__biGalleries
}

const FIELDS = `_id, title, slug, date, clientId, clientIds, "tagged": *[_type == "client" && _id in coalesce(^.clientIds, [^.clientId])]{_id, organizationName}, "clientName": *[_type == "client" && _id == ^.clientId][0].organizationName, projectId,
  "projectTitle": *[_type == "clientProject" && _id == ^.projectId][0].title, status, coverKey, sets, photos, share, downloads, expiresOn, message, originals, drive, createdAt`
const LIST_FIELDS = `_id, title, slug, date, clientId, clientIds, "tagged": *[_type == "client" && _id in coalesce(^.clientIds, [^.clientId])]{_id, organizationName}, "clientName": *[_type == "client" && _id == ^.clientId][0].organizationName, projectId,
  "projectTitle": *[_type == "clientProject" && _id == ^.projectId][0].title, status, coverKey, sets, "photos": photos[_key == ^.coverKey], "count": count(photos),
  "bytes": math::sum(photos[].size), share, downloads, expiresOn, createdAt`

type Tagged = { tagged?: { _id: string; organizationName?: string }[] | null }

/** clientIds is the tag list; clientId always its first entry. Older galleries only have clientId. */
function tags(x: Partial<Gallery> & Tagged) {
  const ids = [...new Set(galleryClientIds({ clientId: x.clientId || undefined, clientIds: x.clientIds ?? undefined }).filter(Boolean))]
  const names = new Map((x.tagged ?? []).map((c) => [c._id, c.organizationName ?? '']))
  const clientNames = x.tagged ? ids.map((id) => names.get(id)).filter((n): n is string => Boolean(n)) : x.clientNames
  return {
    clientId: ids[0],
    clientIds: ids.length ? ids : undefined,
    clientName: (x.tagged ? names.get(ids[0]) : undefined) || x.clientName || undefined,
    clientNames: clientNames?.length ? clientNames : undefined,
  }
}

const normalize = (x: Partial<Gallery> & Tagged & { _id: string }): Gallery => ({
  _id: x._id,
  title: x.title || 'Untitled gallery',
  slug: x.slug || x._id,
  date: x.date || undefined,
  ...tags(x),
  projectId: x.projectId || undefined,
  projectTitle: x.projectTitle || undefined,
  status: x.status === 'live' ? 'live' : 'draft',
  coverKey: x.coverKey || undefined,
  sets: x.sets?.length ? x.sets : [{ _key: 'main', title: 'Highlights' }],
  photos: x.photos ?? [],
  share: x.share ?? { on: false },
  downloads: { full: true, web: true, all: true, ...x.downloads },
  expiresOn: x.expiresOn || undefined,
  message: x.message || undefined,
  originals: x.originals === 'drive' ? 'drive' : 'r2',
  drive: x.drive?.folderId ? { folderId: x.drive.folderId, sets: x.drive.sets ?? [] } : undefined,
  createdAt: x.createdAt || new Date().toISOString(),
  sample: x.sample || x._id.startsWith('sample-') || undefined,
})

async function q<T>(query: string, params: Record<string, unknown> = {}): Promise<T | null> {
  try {
    return await portalClient.fetch<T>(query, params, { cache: 'no-store' })
  } catch (e) {
    console.error('[galleries] query failed', e)
    return null
  }
}

/* ── Reading ───────────────────────────────────────────────────────────── */

export type GallerySummary = Gallery & { count: number; bytes: number }

export async function listGalleries(): Promise<GallerySummary[]> {
  if (useMemory()) return [...mem().galleries.values()].map((x) => ({ ...x, count: x.photos.length, bytes: x.photos.reduce((n, p) => n + p.size, 0) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const rows = await q<(Gallery & { count: number; bytes: number })[]>(`*[_type == "gallery"] | order(createdAt desc){${LIST_FIELDS}}`)
  return (rows ?? []).map((r) => ({ ...normalize(r), count: r.count ?? 0, bytes: r.bytes ?? 0 }))
}

export async function getGallery(id: string): Promise<Gallery | null> {
  if (!/^[\w-]{3,80}$/.test(id)) return null
  if (useMemory()) return mem().galleries.get(id) ?? null
  const row = await q<Gallery>(`*[_type == "gallery" && _id == $id][0]{${FIELDS}}`, { id })
  return row ? normalize(row) : null
}

export async function getGalleryBySlug(slug: string): Promise<Gallery | null> {
  if (!/^[a-z0-9-]{3,100}$/.test(slug)) return null
  if (useMemory()) return [...mem().galleries.values()].find((x) => x.slug === slug) ?? null
  const row = await q<Gallery>(`*[_type == "gallery" && slug == $slug][0]{${FIELDS}}`, { slug })
  return row ? normalize(row) : null
}

/** Live galleries for these clients, newest first (the portal's list). */
export async function galleriesForClients(clientIds: string[]): Promise<Gallery[]> {
  if (!clientIds.length) return []
  if (useMemory() || clientIds.every((c) => c.startsWith('sample-'))) {
    return [...mem().galleries.values()].filter((x) => x.status === 'live' && (x.sample || galleryClientIds(x).some((c) => clientIds.includes(c))))
  }
  const rows = await q<Gallery[]>(`*[_type == "gallery" && status == "live" && (clientId in $ids || count(clientIds[@ in $ids]) > 0)] | order(coalesce(date, createdAt) desc){${FIELDS}}`, { ids: clientIds })
  return (rows ?? []).map(normalize)
}

/** How many live galleries these clients have (the portal sidebar's "Photos" link). */
export async function countGalleriesForClients(clientIds: string[]): Promise<number> {
  if (!clientIds.length) return 0
  if (useMemory() || clientIds.every((c) => c.startsWith('sample-'))) return (await galleriesForClients(clientIds)).length
  return (await q<number>(`count(*[_type == "gallery" && status == "live" && (clientId in $ids || count(clientIds[@ in $ids]) > 0)])`, { ids: clientIds })) ?? 0
}

/* ── Writing (admin) ───────────────────────────────────────────────────── */

const rand = (n = 4) => randomBytes(n).toString('hex')
export const newKey = () => rand(6)
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'gallery'
/** Readable, and random enough that nobody guesses another client's address. */
export const newSlug = (title: string) => `${slugify(title)}-${randomBytes(5).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || rand(3)}`

export type NewGallery = { title: string; date?: string; clientIds?: string[]; projectId?: string; originals?: 'drive' | 'r2' }

export async function createGallery(input: NewGallery): Promise<Gallery> {
  const doc: Gallery = normalize({
    _id: `gallery-${rand(8)}`,
    _type: 'gallery',
    title: input.title,
    slug: newSlug(input.title),
    date: input.date,
    clientIds: input.clientIds?.length ? input.clientIds : undefined,
    projectId: input.projectId,
    status: 'draft',
    sets: [{ _key: newKey(), title: 'Highlights' }],
    photos: [],
    share: { on: false, version: 1 },
    downloads: { full: true, web: true, all: true },
    originals: input.originals ?? 'r2',
    createdAt: new Date().toISOString(),
  })
  if (useMemory()) {
    mem().galleries.set(doc._id, doc)
    return doc
  }
  const { clientName: _c, clientNames: _cn, projectTitle: _p, sample: _s, ...stored } = doc
  await portalClient.create({ ...stored, _type: 'gallery' })
  return doc
}

export type GalleryPatch = Partial<Pick<Gallery, 'title' | 'date' | 'projectId' | 'status' | 'coverKey' | 'expiresOn' | 'message' | 'slug'>> & {
  /** The full tag list; the first becomes clientId. An empty list clears both. */
  clientIds?: string[]
  downloads?: Partial<GalleryDownloads>
  shareOn?: boolean
}

/** Simple field changes. Empty strings clear a field. */
export async function updateGallery(id: string, patch: GalleryPatch) {
  const set: Record<string, unknown> = {}
  const unset: string[] = []
  for (const k of ['title', 'date', 'projectId', 'status', 'coverKey', 'expiresOn', 'message', 'slug'] as const) {
    if (!(k in patch)) continue
    const v = patch[k]
    if (v === '' || v === undefined || v === null) unset.push(k)
    else set[k] = v
  }
  if (patch.clientIds) {
    const ids = [...new Set(patch.clientIds.filter(Boolean))]
    if (ids.length) {
      set.clientIds = ids
      set.clientId = ids[0]
    } else unset.push('clientIds', 'clientId')
  }
  if (patch.downloads) for (const [k, v] of Object.entries(patch.downloads)) if (typeof v === 'boolean') set[`downloads.${k}`] = v
  if (typeof patch.shareOn === 'boolean') set['share.on'] = patch.shareOn
  if (useMemory()) {
    const cur = mem().galleries.get(id)
    if (!cur) return
    const next: Gallery = { ...cur, downloads: { ...cur.downloads, ...patch.downloads }, share: { ...cur.share, ...(typeof patch.shareOn === 'boolean' ? { on: patch.shareOn } : {}) } }
    for (const [k, v] of Object.entries(set)) if (!k.includes('.')) (next as Record<string, unknown>)[k] = v
    for (const k of unset) delete (next as Record<string, unknown>)[k]
    if (patch.clientIds) {
      next.clientName = undefined
      next.clientNames = undefined
    }
    mem().galleries.set(id, next)
    return
  }
  let p = portalClient.patch(id).setIfMissing({ downloads: {}, share: { on: false } })
  if (Object.keys(set).length) p = p.set(set)
  if (unset.length) p = p.unset(unset)
  await p.commit()
}

export async function setPassword(id: string, password: string | null) {
  const cur = await getGallery(id)
  if (!cur) return
  const version = (cur.share.version ?? 1) + 1
  let passwordHash: string | undefined
  if (password) {
    const salt = rand(16)
    passwordHash = `${salt}:${(await scrypt(password, salt, 32)).toString('hex')}`
  }
  if (useMemory()) {
    mem().galleries.set(id, { ...cur, share: { ...cur.share, passwordHash, version } })
    return
  }
  const p = portalClient.patch(id).set({ 'share.version': version })
  await (passwordHash ? p.set({ 'share.passwordHash': passwordHash }) : p.unset(['share.passwordHash'])).commit()
}

export async function checkPassword(gal: Gallery, password: string) {
  const h = gal.share.passwordHash
  if (!h) return true
  const [salt, hex] = h.split(':')
  if (!salt || !hex) return false
  const got = await scrypt(password, salt, 32)
  const want = Buffer.from(hex, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Remembers the gallery's Drive folders (made on its first upload). */
export async function setDrive(id: string, drive: Gallery['drive']) {
  if (useMemory()) {
    const cur = mem().galleries.get(id)
    if (cur) mem().galleries.set(id, { ...cur, drive })
    return
  }
  await portalClient.patch(id).set({ drive }).commit({ autoGenerateArrayKeys: false })
}

export async function setSets(id: string, sets: GallerySet[]) {
  if (useMemory()) {
    const cur = mem().galleries.get(id)
    if (cur) mem().galleries.set(id, { ...cur, sets })
    return
  }
  await portalClient.patch(id).set({ sets }).commit()
}

export async function addPhotos(id: string, photos: GalleryPhoto[]) {
  if (!photos.length) return
  if (useMemory()) {
    const cur = mem().galleries.get(id)
    if (cur) mem().galleries.set(id, { ...cur, photos: [...cur.photos, ...photos], coverKey: cur.coverKey ?? photos[0]._key })
    return
  }
  await portalClient.patch(id).setIfMissing({ photos: [] }).append('photos', photos).commit({ autoGenerateArrayKeys: false })
  // The first photo uploaded becomes the cover until Josh picks one.
  await portalClient.patch(id).setIfMissing({ coverKey: photos[0]._key }).commit().catch(() => {})
}

/** Moves photos to another set. */
export async function movePhotos(id: string, keys: string[], set: string) {
  if (useMemory()) {
    const cur = mem().galleries.get(id)
    if (cur) mem().galleries.set(id, { ...cur, photos: cur.photos.map((p) => (keys.includes(p._key) ? { ...p, set } : p)) })
    return
  }
  const patch = Object.fromEntries(keys.map((k) => [`photos[_key == "${k}"].set`, set]))
  await portalClient.patch(id).set(patch).commit()
}

/** Puts photos in this order (keys not listed keep their place at the end). */
export async function reorderPhotos(id: string, keys: string[]) {
  const cur = await getGallery(id)
  if (!cur) return
  const pos = new Map(keys.map((k, i) => [k, i]))
  const photos = [...cur.photos].sort((a, b) => (pos.get(a._key) ?? 1e9) - (pos.get(b._key) ?? 1e9))
  if (useMemory()) {
    mem().galleries.set(id, { ...cur, photos })
    return
  }
  await portalClient.patch(id).set({ photos }).commit({ autoGenerateArrayKeys: false })
}

/** Takes photos out of the record. The caller removes their files. */
export async function removePhotos(id: string, keys: string[]) {
  if (useMemory()) {
    const cur = mem().galleries.get(id)
    if (cur) mem().galleries.set(id, { ...cur, photos: cur.photos.filter((p) => !keys.includes(p._key)), coverKey: cur.coverKey && keys.includes(cur.coverKey) ? undefined : cur.coverKey })
    return
  }
  await portalClient.patch(id).unset(keys.map((k) => `photos[_key == "${k}"]`)).commit()
}

/** Deletes the gallery record and its favourites and visits. The caller removes the files. */
export async function deleteGallery(id: string) {
  if (useMemory()) {
    mem().galleries.delete(id)
    for (const [k, v] of mem().favs) if (v.gallery === id) mem().favs.delete(k)
    for (const [k, v] of mem().visits) if (v.gallery === id) mem().visits.delete(k)
    return
  }
  await portalClient.delete({ query: `*[_type in ["galleryFav", "galleryVisit"] && gallery == $id]`, params: { id } })
  await portalClient.delete(id)
}

/* ── Favourites and visits ─────────────────────────────────────────────── */

export type Who = { kind: ViewerKind; name: string; email?: string; /** Stable id for this person (email or guest browser id). */ id: string }
const whoHash = (galleryId: string, who: Who) => createHash('sha256').update(`${galleryId}|${who.kind}|${who.id.toLowerCase()}`).digest('hex').slice(0, 24)
const favId = (galleryId: string, who: Who) => `gfav-${galleryId}-${whoHash(galleryId, who)}`
const visitId = (galleryId: string, who: Who) => `gvisit-${galleryId}-${whoHash(galleryId, who)}`

export async function getFavourites(galleryId: string, who: Who): Promise<string[]> {
  if (useMemory()) return mem().favs.get(favId(galleryId, who))?.keys ?? []
  return (await q<string[]>(`*[_id == $id][0].keys`, { id: favId(galleryId, who) })) ?? []
}

export async function setFavourite(galleryId: string, who: Who, key: string, on: boolean) {
  const id = favId(galleryId, who)
  const now = new Date().toISOString()
  if (useMemory()) {
    const cur = mem().favs.get(id) ?? { gallery: galleryId, viewerName: who.name, viewerEmail: who.email, kind: who.kind, keys: [], updatedAt: now }
    const keys = on ? [...new Set([...cur.keys, key])] : cur.keys.filter((k) => k !== key)
    mem().favs.set(id, { ...cur, viewerName: who.name, keys, updatedAt: now })
    return
  }
  await portalClient.createIfNotExists({ _id: id, _type: 'galleryFav', gallery: galleryId, kind: who.kind, keys: [] })
  let p = portalClient.patch(id).set({ viewerName: who.name, updatedAt: now, ...(who.email ? { viewerEmail: who.email } : {}) }).setIfMissing({ keys: [] })
  p = on ? p.unset([`keys[@ == "${key}"]`]).append('keys', [key]) : p.unset([`keys[@ == "${key}"]`])
  await p.commit()
}

export async function listFavourites(galleryId: string): Promise<FavouriteList[]> {
  if (useMemory()) return [...mem().favs.values()].filter((f) => f.gallery === galleryId && f.keys.length)
  return (await q<FavouriteList[]>(`*[_type == "galleryFav" && gallery == $id && count(keys) > 0] | order(updatedAt desc){viewerName, viewerEmail, kind, keys, updatedAt}`, { id: galleryId })) ?? []
}

const VIEW_GAP = 30 * 60_000

/** Counts a visit (once per half hour per person). */
export async function recordView(galleryId: string, who: Who) {
  const id = visitId(galleryId, who)
  const now = new Date().toISOString()
  if (useMemory()) {
    const cur = mem().visits.get(id)
    if (cur && Date.now() - Date.parse(cur.lastAt) < VIEW_GAP) return void mem().visits.set(id, { ...cur, lastAt: now })
    mem().visits.set(id, { gallery: galleryId, viewerName: who.name, viewerEmail: who.email, kind: who.kind, firstAt: cur?.firstAt ?? now, lastAt: now, views: (cur?.views ?? 0) + 1, downloads: cur?.downloads ?? [] })
    return
  }
  try {
    const cur = await q<{ lastAt?: string }>(`*[_id == $id][0]{lastAt}`, { id })
    await portalClient.createIfNotExists({ _id: id, _type: 'galleryVisit', gallery: galleryId, kind: who.kind, firstAt: now, views: 0, downloads: [] })
    let p = portalClient.patch(id).set({ lastAt: now, viewerName: who.name, ...(who.email ? { viewerEmail: who.email } : {}) })
    if (!cur?.lastAt || Date.now() - Date.parse(cur.lastAt) >= VIEW_GAP) p = p.inc({ views: 1 })
    await p.commit()
  } catch (e) {
    console.error('[galleries] view not recorded', e)
  }
}

export async function recordDownload(galleryId: string, who: Who, ev: Omit<DownloadEvent, 'at'>) {
  const id = visitId(galleryId, who)
  const now = new Date().toISOString()
  const item = { ...ev, at: now }
  if (useMemory()) {
    const cur = mem().visits.get(id) ?? { gallery: galleryId, viewerName: who.name, viewerEmail: who.email, kind: who.kind, firstAt: now, lastAt: now, views: 1, downloads: [] }
    mem().visits.set(id, { ...cur, lastAt: now, downloads: [item, ...cur.downloads].slice(0, 300) })
    return
  }
  try {
    await portalClient.createIfNotExists({ _id: id, _type: 'galleryVisit', gallery: galleryId, kind: who.kind, firstAt: now, views: 1, downloads: [] })
    await portalClient
      .patch(id)
      .set({ lastAt: now, viewerName: who.name, ...(who.email ? { viewerEmail: who.email } : {}) })
      .setIfMissing({ downloads: [] })
      .append('downloads', [{ ...item, _key: rand(5) }])
      .commit({ autoGenerateArrayKeys: false })
  } catch (e) {
    console.error('[galleries] download not recorded', e)
  }
}

export async function listVisits(galleryId: string): Promise<Visit[]> {
  if (useMemory()) return [...mem().visits.values()].filter((v) => v.gallery === galleryId).sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  return ((await q<Visit[]>(`*[_type == "galleryVisit" && gallery == $id] | order(lastAt desc){viewerName, viewerEmail, kind, firstAt, lastAt, views, "downloads": downloads[-100...]}`, { id: galleryId })) ?? []).map((v) => ({ ...v, downloads: [...(v.downloads ?? [])].reverse() }))
}

/** Sample mode for the back office: shown in /admin so Josh knows nothing is saved. */
export const galleriesSampleMode = () => useMemory() && adminSampleMode()
