import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { adminFromRequest, getAdminSession } from '@/admin/auth'
import { getSession } from '@/portal/auth'
import { sessionSecret } from '@/portal/config'
import { getAccess } from '@/portal/data'
import { viewUrl } from './files'
import { getFavourites, getGallery, getGalleryBySlug, useMemory, type Who } from './store'
import { isExpired, type Gallery, type GalleryView, type GalleryViewer, zipParts } from './types'

/**
 * Who may open a gallery, and as whom:
 *
 *  portal   a signed-in portal contact whose client the gallery belongs to (live, not closed).
 *           "View as client" previews from the back office see it but save nothing.
 *  share    anyone with the /g/<slug> link while sharing is on (live, not closed), after the
 *           password if there is one. To keep favourites they give a name (and optionally an
 *           email) once; it's kept in a cookie.
 *  admin    Josh in the back office: any gallery, any state, nothing recorded.
 *
 * Anything not allowed gets the same "not found" answer, so links can't be probed.
 */

export type Via = 'portal' | 'share' | 'admin'
export type Resolved = { gallery: Gallery; viewer: GalleryViewer; who: Who | null; via: Via; ref: string; org?: string; /** Nothing is written (samples outside local dev, previews). */ readOnly: boolean }
export type Denied = { denied: 'not-found' | 'closed' | 'locked'; gallery?: Gallery }

const UNLOCK = (id: string) => `bi_gal_${id.replace(/[^\w-]/g, '')}`
const GUEST = 'bi_gal_guest'
const sign = (s: string) => createHmac('sha256', sessionSecret() || 'gallery').update(`gallery|${s}`).digest('base64url').slice(0, 32)
const cookieOpts = (days: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: days * 86_400 })

/* ── Password unlock ───────────────────────────────────────────────────── */

const unlockValue = (g: Gallery) => sign(`${g._id}|${g.share.version ?? 1}`)

export async function isUnlocked(g: Gallery) {
  if (!g.share.passwordHash) return true
  const v = (await cookies()).get(UNLOCK(g._id))?.value ?? ''
  const want = unlockValue(g)
  return v.length === want.length && timingSafeEqual(Buffer.from(v), Buffer.from(want))
}

export async function setUnlocked(g: Gallery) {
  ;(await cookies()).set(UNLOCK(g._id), unlockValue(g), cookieOpts(30))
}

/* ── Guest identity ────────────────────────────────────────────────────── */

export type Guest = { name: string; email?: string; id: string }

export const cleanName = (s: unknown) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60)
export const cleanEmail = (s: unknown) => {
  const e = String(s ?? '').trim().toLowerCase().slice(0, 120)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''
}

export async function readGuest(): Promise<Guest | null> {
  const raw = (await cookies()).get(GUEST)?.value
  if (!raw) return null
  const [body, sig] = raw.split('.')
  if (!body || sig !== sign(body)) return null
  try {
    const g = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Guest
    return g?.id && g.name ? { name: cleanName(g.name), email: cleanEmail(g.email) || undefined, id: String(g.id).slice(0, 40) } : null
  } catch {
    return null
  }
}

export async function saveGuest(name: string, email?: string): Promise<Guest> {
  const prev = await readGuest()
  const g: Guest = { name, email: email || undefined, id: prev?.id ?? randomBytes(12).toString('base64url') }
  const body = Buffer.from(JSON.stringify(g)).toString('base64url')
  ;(await cookies()).set(GUEST, `${body}.${sign(body)}`, cookieOpts(365))
  return g
}

/* ── Resolving ─────────────────────────────────────────────────────────── */

const firstName = (email: string) => email.split('@')[0].split(/[._-]/)[0].replace(/^./, (c) => c.toUpperCase())

/** For pages and API routes. `req` is given by API routes (admin requests need it for the same-origin check). */
export async function resolveGallery(via: unknown, ref: unknown, req?: Request): Promise<Resolved | Denied> {
  if (typeof ref !== 'string' || !ref) return { denied: 'not-found' }

  if (via === 'admin') {
    const admin = req ? await adminFromRequest(req) : await getAdminSession()
    if (!admin) return { denied: 'not-found' }
    const gallery = await getGallery(ref)
    if (!gallery) return { denied: 'not-found' }
    return { gallery, via, ref, org: gallery.clientName, viewer: { kind: 'admin', name: firstName(admin.email), email: admin.email, canFavourite: false }, who: null, readOnly: true }
  }

  if (via === 'portal') {
    const session = await getSession()
    if (!session) return { denied: 'not-found' }
    const gallery = await getGallery(ref)
    if (!gallery || gallery.status !== 'live') return { denied: 'not-found' }
    const access = await getAccess(session)
    const ids = access.clients.map((c) => c._id)
    const mine = gallery.sample ? Boolean(session.demo) || useMemory() : Boolean(gallery.clientId && ids.includes(gallery.clientId))
    if (!mine) return { denied: 'not-found' }
    if (isExpired(gallery)) return { denied: 'closed', gallery }
    const contact = access.clients.flatMap((c) => c.contacts ?? []).find((c) => c.email.toLowerCase() === session.email.toLowerCase())
    const preview = Boolean(session.preview)
    const name = preview ? `${firstName(session.email)} (viewing as client)` : contact?.name || access.name || firstName(session.email)
    const readOnly = preview || (Boolean(gallery.sample) && !useMemory())
    return {
      gallery,
      via,
      ref,
      org: access.clients.find((c) => c._id === gallery.clientId)?.organizationName ?? gallery.clientName,
      viewer: { kind: 'client', name, email: session.email, canFavourite: !preview },
      who: preview ? null : { kind: 'client', name, email: session.email, id: session.email },
      readOnly,
    }
  }

  if (via === 'share') {
    const gallery = await getGalleryBySlug(ref)
    if (!gallery || gallery.status !== 'live' || !gallery.share.on) return { denied: 'not-found' }
    if (isExpired(gallery)) return { denied: 'closed', gallery }
    if (!(await isUnlocked(gallery))) return { denied: 'locked', gallery }
    const guest = await readGuest()
    return {
      gallery,
      via,
      ref,
      org: gallery.clientName,
      viewer: { kind: 'guest', name: guest?.name ?? 'Guest', email: guest?.email, canFavourite: Boolean(guest) },
      who: guest ? { kind: 'guest', name: guest.name, email: guest.email, id: guest.id } : null,
      readOnly: Boolean(gallery.sample) && !useMemory(),
    }
  }

  return { denied: 'not-found' }
}

export const isDenied = (r: Resolved | Denied): r is Denied => 'denied' in r

/** A nameless share visitor still counts in the stats, as one "Visitor" per browser-less hit. */
export const statsWho = (r: Resolved): Who | null => (r.via === 'admin' || r.viewer.name.endsWith('(viewing as client)') ? null : r.who ?? { kind: 'guest', name: 'Visitor (no name given)', id: 'anonymous' })

/** What the browser gets: photo addresses, favourites, and nothing secret. */
export async function galleryView(r: Resolved): Promise<GalleryView> {
  const g = r.gallery
  const first = g.sets[0]?._key ?? ''
  const setKeys = new Set(g.sets.map((s) => s._key))
  const photos = g.photos.map((p) => ({ key: p._key, set: p.set && setKeys.has(p.set) ? p.set : first, name: p.name, w: p.w, h: p.h, thumb: viewUrl(g, p, 'thumb'), web: viewUrl(g, p, 'web') }))
  const cover = g.photos.find((p) => p._key === g.coverKey) ?? g.photos[0]
  const favourites = r.who && r.viewer.canFavourite ? await getFavourites(g._id, r.who) : []
  return {
    id: g._id,
    title: g.title,
    date: g.date,
    message: g.message,
    org: r.org,
    cover: cover ? { thumb: viewUrl(g, cover, 'thumb'), web: viewUrl(g, cover, 'web'), w: cover.w, h: cover.h } : undefined,
    sets: g.sets.filter((s) => photos.some((p) => p.set === s._key)),
    photos,
    downloads: g.downloads,
    expiresOn: g.expiresOn,
    totals: { full: g.photos.reduce((n, p) => n + p.size, 0), web: g.photos.reduce((n, p) => n + (p.webSize ?? p.size / 6), 0) },
    via: r.via,
    ref: r.ref,
    viewer: r.viewer,
    favourites,
    sample: Boolean(g.sample),
  }
}

/** The photos in a zip request: everything, one set, or the viewer's favourites; then one part of it. */
export function zipSelection(g: Gallery, scope: string, size: 'full' | 'web', favs: string[] = []) {
  const first = g.sets[0]?._key ?? ''
  const inScope = g.photos.filter((p) => (scope === 'all' ? true : scope === 'favourites' ? favs.includes(p._key) : (p.set || first) === scope))
  return zipParts(inScope, size)
}
