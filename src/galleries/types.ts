/**
 * Photo galleries: Breaking Ice's own replacement for Pixieset.
 *
 * One `gallery` document per shoot in the private portal dataset. Photos live in R2 as three
 * files each (the original, a ~2048 px web copy and a ~800 px thumbnail, the two smaller ones
 * made in Josh's browser while uploading), under galleries/<gallery id>/<photo key>/.
 * Favourites and visits are their own small documents so a busy gallery never rewrites the big one.
 *
 * Shared by server and browser code: nothing secret in here.
 */

export type PhotoSize = 'full' | 'web'

export type GallerySet = { _key: string; title: string }

export type GalleryPhoto = {
  _key: string
  /** Set key; empty means the first set. */
  set?: string
  /** Original file name, used for downloads and Josh's selects list. */
  name: string
  /** Original pixel size. */
  w: number
  h: number
  /** Bytes of each file, for zip sizes. */
  size: number
  webSize?: number
  /** Original file extension (jpg, png, webp). */
  ext: string
  /** Google Drive file id of the original, when originals live in Drive (the R2 copy is then only the previews). */
  driveId?: string
  uploadedAt: string
}

/** The gallery's folders in the Shared Drive: BI Clients / [Client] / Photos / [date title] / [set]. */
export type GalleryDrive = { folderId: string; sets: { _key: string; folderId: string }[] }

export type GalleryShare = {
  on: boolean
  /** scrypt hash ("salt:hash", hex) of the optional password. Never sent to the browser. */
  passwordHash?: string
  /** Bumped when the password changes, so old unlock cookies stop working. */
  version?: number
}

export type GalleryDownloads = {
  /** Originals. */
  full: boolean
  /** ~2048 px copies. */
  web: boolean
  /** Download all / a set as zip. */
  all: boolean
}

export type Gallery = {
  _id: string
  _type?: 'gallery'
  title: string
  /** Readable + random, for /g/<slug>. */
  slug: string
  /** Shoot date, YYYY-MM-DD. */
  date?: string
  /** client document id: shows in that client's portal. */
  clientId?: string
  clientName?: string
  /** clientProject id, optional. */
  projectId?: string
  projectTitle?: string
  /** 'draft' galleries are only visible in /admin. */
  status: 'draft' | 'live'
  coverKey?: string
  sets: GallerySet[]
  photos: GalleryPhoto[]
  share: GalleryShare
  downloads: GalleryDownloads
  /** Last day the gallery is open, YYYY-MM-DD (Edmonton time). Empty = never closes. */
  expiresOn?: string
  /** A short note shown under the title. */
  message?: string
  /** Where full-size originals go: Google Drive (new galleries, when Drive is set up) or R2 (the first galleries). */
  originals?: 'drive' | 'r2'
  drive?: GalleryDrive
  createdAt: string
  /** Sample galleries never touch Sanity or R2. */
  sample?: boolean
}

export type ViewerKind = 'client' | 'guest' | 'admin'

/** Who is looking, as the browser may know it. */
export type GalleryViewer = {
  kind: ViewerKind
  name: string
  email?: string
  /** Favourites can be saved (needs a name for guests; never for "view as client" previews). */
  canFavourite: boolean
}

export type FavouriteList = {
  viewerName: string
  viewerEmail?: string
  kind: ViewerKind
  keys: string[]
  updatedAt: string
}

export type DownloadEvent = {
  at: string
  what: 'photo' | 'zip'
  size: PhotoSize
  /** Photo key, or set key / 'all' for zips. */
  ref: string
  label?: string
}

export type Visit = {
  viewerName: string
  viewerEmail?: string
  kind: ViewerKind
  firstAt: string
  lastAt: string
  views: number
  downloads: DownloadEvent[]
}

/** One photo as the browser gets it: addresses are short-lived. */
export type PhotoView = {
  key: string
  set: string
  name: string
  w: number
  h: number
  thumb: string
  web: string
}

/** Everything the client-side gallery needs. */
export type GalleryView = {
  id: string
  title: string
  date?: string
  message?: string
  org?: string
  cover?: { thumb: string; web: string; w: number; h: number }
  sets: GallerySet[]
  photos: PhotoView[]
  downloads: GalleryDownloads
  expiresOn?: string
  /** Approximate bytes for "Download all", per size, so the button can say how big. */
  totals: { full: number; web: number }
  /** How the API calls should identify the gallery. */
  via: 'portal' | 'share' | 'admin'
  /** Share slug (share), or gallery id (portal/admin). */
  ref: string
  viewer: GalleryViewer
  favourites: string[]
  sample: boolean
}

/** Zips stay under this so no ZIP64 is needed and one part finishes well inside a function's time limit. */
export const ZIP_PART_BYTES = 2 * 1024 ** 3

export const THUMB_EDGE = 800
export const WEB_EDGE = 2048
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_PHOTO_BYTES = 200 * 1024 ** 2

export const extOf = (name: string) => (/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] ?? 'jpg').toLowerCase().replace('jpeg', 'jpg')

/** Splits photos into zip parts that each stay under ZIP_PART_BYTES. */
export function zipParts<T extends { size: number; webSize?: number }>(photos: T[], size: PhotoSize): T[][] {
  const parts: T[][] = []
  let cur: T[] = []
  let bytes = 0
  for (const p of photos) {
    const b = (size === 'web' ? p.webSize ?? p.size / 6 : p.size) + 200
    if (cur.length && bytes + b > ZIP_PART_BYTES) {
      parts.push(cur)
      cur = []
      bytes = 0
    }
    cur.push(p)
    bytes += b
  }
  if (cur.length) parts.push(cur)
  return parts
}

/** Today in Edmonton, YYYY-MM-DD. */
export const todayEdmonton = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(now)

export const isExpired = (g: Pick<Gallery, 'expiresOn'>, now = new Date()) => Boolean(g.expiresOn && g.expiresOn < todayEdmonton(now))

/** Days until it closes (0 = closes today), or null if it never does. */
export function daysLeft(g: Pick<Gallery, 'expiresOn'>, now = new Date()) {
  if (!g.expiresOn) return null
  const a = Date.parse(`${todayEdmonton(now)}T00:00:00Z`)
  const b = Date.parse(`${g.expiresOn}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export const formatBytes = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${Math.round(n / 1024 ** 2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
