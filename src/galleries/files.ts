import 'server-only'
import { createHmac } from 'node:crypto'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deleteObject, presign, presignGet, presignPut, r2Env, r2Ready } from '@/portal/r2'
import type { Gallery, GalleryPhoto, PhotoSize } from './types'

/**
 * Where a gallery's files live and how the browser reaches them.
 *
 *  R2 (real galleries)      galleries/<gallery id>/<photo key>/{orig.<ext>,web.jpg,thumb.jpg}
 *  Sample galleries         the made-up shoot in /public/samples/gallery
 *  Local sample uploads     a folder in the system temp dir, so /admin's uploader can be tried
 *                           end to end on a laptop with no R2 settings (development only)
 *
 * Thumbnails and web copies are signed against the start of the current hour, so their
 * addresses stay the same for an hour and the browser's cache keeps working between visits.
 */

export type FileKind = 'orig' | 'web' | 'thumb'

export const fileKey = (galleryId: string, p: Pick<GalleryPhoto, '_key' | 'ext'>, kind: FileKind) =>
  `galleries/${galleryId}/${p._key}/${kind === 'orig' ? `orig.${p.ext}` : `${kind}.jpg`}`

/** Local uploads only ever happen in development without R2. */
export const localFiles = () => !r2Ready() && process.env.NODE_ENV !== 'production'
const LOCAL_DIR = path.join(tmpdir(), 'bi-galleries')
const localPath = (key: string) => {
  const p = path.normalize(path.join(LOCAL_DIR, key))
  if (!p.startsWith(LOCAL_DIR + path.sep) || !/^galleries\/[\w-]+\/[\w-]+\/(orig\.[a-z0-9]{2,5}|web\.jpg|thumb\.jpg)$/.test(key)) throw new Error('bad key')
  return p
}
const localSecret = () => process.env.PORTAL_SECRET || 'local-gallery-files-dev-only'
const localSig = (method: string, key: string, exp: number) => createHmac('sha256', localSecret()).update(`${method}|${key}|${exp}`).digest('base64url').slice(0, 32)

function localUrl(method: 'GET' | 'PUT', key: string, expires: number, download?: string) {
  const exp = Math.floor(Date.now() / 1000) + expires
  const q = new URLSearchParams({ k: key, e: String(exp), s: localSig(method, key, exp) })
  if (download) q.set('d', download)
  return `/api/galleries/local-file?${q}`
}

/** For /api/galleries/local-file: is this signed local address genuine and unexpired? */
export function checkLocal(method: 'GET' | 'PUT', key: string, exp: string, sig: string) {
  const e = Number(exp)
  return localFiles() && Number.isFinite(e) && e * 1000 > Date.now() && sig === localSig(method, key, e)
}
export async function writeLocal(key: string, body: ArrayBuffer) {
  const p = localPath(key)
  await mkdir(path.dirname(p), { recursive: true })
  await writeFile(p, Buffer.from(body))
}
export const readLocal = (key: string) => readFile(localPath(key))
export const sizeLocal = (key: string) => stat(localPath(key)).then((s) => s.size).catch(() => null)

const SAMPLE_DIR = '/samples/gallery'
const sampleFile = (p: GalleryPhoto, kind: FileKind) => `${SAMPLE_DIR}/${p._key}${kind === 'thumb' ? '-thumb' : kind === 'web' ? '-web' : ''}.jpg`

const hourStart = () => {
  const d = new Date()
  d.setUTCMinutes(0, 0, 0)
  return d
}

/** Address for showing a photo (thumb or web), stable for the hour. */
export function viewUrl(g: Pick<Gallery, '_id' | 'sample'>, p: GalleryPhoto, kind: 'thumb' | 'web') {
  if (g.sample) return sampleFile(p, kind)
  const key = fileKey(g._id, p, kind)
  if (localFiles()) return localUrl('GET', key, 3 * 3600)
  if (!r2Ready()) return ''
  return presign({
    method: 'GET',
    host: `${r2Env.accountId}.r2.cloudflarestorage.com`,
    path: `/${r2Env.bucket}/${key}`,
    query: { 'response-cache-control': 'private, max-age=7200' },
    expires: 3 * 3600,
    accessKeyId: r2Env.accessKeyId,
    secretAccessKey: r2Env.secretAccessKey,
    region: 'auto',
    now: hourStart(),
  })
}

/** The download name for one photo at one size: the original name, with "-web" for the small copy. */
export const downloadName = (p: GalleryPhoto, size: PhotoSize) => (size === 'full' ? p.name : `${p.name.replace(/\.[^.]+$/, '')}-web.jpg`)

/** Short-lived address that downloads one photo with its proper name. */
export function downloadUrl(g: Pick<Gallery, '_id' | 'sample'>, p: GalleryPhoto, size: PhotoSize) {
  const kind: FileKind = size === 'full' ? 'orig' : 'web'
  if (g.sample) return sampleFile(p, kind)
  const key = fileKey(g._id, p, kind)
  if (localFiles()) return localUrl('GET', key, 600, downloadName(p, size))
  return presignGet(key, { expires: 600, download: downloadName(p, size) })
}

/** Where Josh's browser PUTs one file of a new photo. */
export function uploadUrl(galleryId: string, p: Pick<GalleryPhoto, '_key' | 'ext'>, kind: FileKind) {
  const key = fileKey(galleryId, p, kind)
  if (localFiles()) return localUrl('PUT', key, 3 * 3600)
  return presignPut(key, 3 * 3600)
}

/** Size of one stored file, or null if it isn't there (checks an upload really landed). */
export async function storedSize(galleryId: string, p: Pick<GalleryPhoto, '_key' | 'ext'>, kind: FileKind) {
  const key = fileKey(galleryId, p, kind)
  if (localFiles()) return sizeLocal(key)
  const { headObject } = await import('@/portal/r2')
  return headObject(key)
}

/** The bytes of one file, as a stream, for zips. */
export async function readStream(g: Pick<Gallery, '_id' | 'sample'>, p: GalleryPhoto, kind: FileKind): Promise<ReadableStream<Uint8Array>> {
  if (g.sample) {
    const buf = await readFile(path.join(process.cwd(), 'public', sampleFile(p, kind)))
    return new Blob([new Uint8Array(buf)]).stream()
  }
  const key = fileKey(g._id, p, kind)
  if (localFiles()) return new Blob([new Uint8Array(await readLocal(key))]).stream()
  const res = await fetch(presignGet(key, { expires: 3600 }), { cache: 'no-store' })
  if (!res.ok || !res.body) throw new Error(`r2 GET ${res.status} for ${key}`)
  return res.body
}

/** Removes a photo's three files. Failures are logged, not thrown: a stray file costs cents, a stuck delete costs Josh time. */
export async function removePhotoFiles(galleryId: string, p: Pick<GalleryPhoto, '_key' | 'ext'>) {
  await Promise.all(
    (['orig', 'web', 'thumb'] as const).map(async (kind) => {
      const key = fileKey(galleryId, p, kind)
      try {
        if (localFiles()) await unlink(localPath(key)).catch(() => {})
        else if (r2Ready()) await deleteObject(key)
      } catch (e) {
        console.error('[galleries] delete failed', key, e)
      }
    }),
  )
}
