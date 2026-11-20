import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { driveReady } from '@/portal/config'
import { portalClient } from '@/portal/data'
import { downloadStream, ensureClientSubfolder, ensureSharedSubfolder, fileMeta, startUploadToFolder } from '@/portal/drive'
import { localFiles } from './files'
import { setDrive, useMemory } from './store'
import type { Gallery, GalleryPhoto } from './types'

/**
 * Full-size originals in Google Drive; R2 only keeps the small previews.
 *
 *   BI Clients / [Client] / Photos / [YYYY-MM-DD Gallery title] / [Set]
 *   BI Clients / Galleries without a client / [YYYY-MM-DD Gallery title] / [Set]
 *
 * Josh's browser sends each original straight to Google (resumable upload, the same as the
 * portal's file uploads), so nothing big passes through our server on the way in. Full-size
 * downloads and zips stream from Drive. Nothing here ever deletes or moves a Drive file:
 * taking a photo or a whole gallery off the site leaves the originals where they are.
 *
 * On a laptop with no Google settings, a stand-in (/api/galleries/local-drive) speaks the same
 * resumable protocol and keeps files in the temp folder, so the whole flow can be tried locally.
 */

const NO_CLIENT = 'Galleries without a client'
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
export const mimeOf = (p: Pick<GalleryPhoto, 'ext'>) => MIME[p.ext] ?? 'image/jpeg'

/** Real Drive, or the local stand-in. */
export const driveOriginalsReady = () => driveReady() || localFiles()
const local = () => !driveReady() && localFiles()

/* ── Local stand-in ────────────────────────────────────────────────────── */

const LOCAL_DIR = path.join(tmpdir(), 'bi-galleries', 'drive')
const localSecret = () => process.env.PORTAL_SECRET || 'local-gallery-files-dev-only'
const localSig = (id: string, folder: string, total: number) => createHmac('sha256', localSecret()).update(`drive|${id}|${folder}|${total}`).digest('base64url').slice(0, 32)
const localPath = (id: string) => {
  if (!/^local-[\w-]{10,40}$/.test(id)) throw new Error('bad id')
  return path.join(LOCAL_DIR, id)
}

/** For /api/galleries/local-drive: the session's file id, if the address is genuine. */
export function checkLocalSession(id: string, folder: string, total: string, sig: string) {
  return local() && sig === localSig(id, folder, Number(total)) ? { id, folder, total: Number(total) } : null
}
export const localReceived = (id: string) => stat(localPath(id)).then((s) => s.size).catch(() => 0)
export async function localAppend(id: string, folder: string, bytes: Uint8Array) {
  await mkdir(LOCAL_DIR, { recursive: true })
  await appendFile(localPath(id), bytes)
  await writeFile(path.join(LOCAL_DIR, `${id}.folder`), folder)
}
async function localMeta(id: string) {
  try {
    const [size, folder] = await Promise.all([stat(localPath(id)).then((s) => s.size), readFile(path.join(LOCAL_DIR, `${id}.folder`), 'utf8')])
    return { size, folder }
  } catch {
    return null
  }
}

/* ── Folders ───────────────────────────────────────────────────────────── */

const label = (g: Pick<Gallery, 'date' | 'createdAt' | 'title'>) => `${g.date || g.createdAt.slice(0, 10)} ${g.title}`.trim()

async function clientDoc(id: string) {
  if (useMemory()) return null
  return portalClient.fetch<{ _id: string; organizationName: string; driveFolderId?: string } | null>(`*[_type == "client" && _id == $id][0]{_id, organizationName, driveFolderId}`, { id }, { cache: 'no-store' })
}

/** The Drive folder for one set of this gallery, made (and remembered on the gallery) the first time it's needed. */
export async function setFolder(g: Gallery, setKey: string): Promise<string> {
  const known = g.drive?.sets.find((s) => s._key === setKey)
  if (known) return known.folderId
  const setTitle = g.sets.find((s) => s._key === setKey)?.title ?? 'Photos'
  let root = g.drive?.folderId
  let folder: string
  if (local()) {
    root ||= `local-folder-${randomBytes(6).toString('hex')}`
    folder = `local-folder-${randomBytes(6).toString('hex')}`
  } else {
    const client = g.clientId ? await clientDoc(g.clientId) : null
    if (!root) root = client ? await ensureClientSubfolder(client, ['Photos', label(g)]) : await ensureSharedSubfolder([NO_CLIENT, label(g)])
    folder = client ? await ensureClientSubfolder(client, ['Photos', label(g), setTitle]) : await ensureSharedSubfolder([NO_CLIENT, label(g), setTitle])
  }
  const drive = { folderId: root, sets: [...(g.drive?.sets ?? []), { _key: setKey, folderId: folder }] }
  await setDrive(g._id, drive)
  g.drive = drive
  return folder
}

export const folderUrl = (folderId: string) => (folderId.startsWith('local-') ? '' : `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`)

/* ── Upload, check, read ───────────────────────────────────────────────── */

/** Opens a resumable upload for one original; the browser sends the bytes straight there. */
export async function startOriginal(folder: string, file: { name: string; size: number; type: string }, origin: string) {
  if (local()) {
    const id = `local-${randomBytes(12).toString('base64url')}`
    const q = new URLSearchParams({ id, f: folder, t: String(file.size), s: localSig(id, folder, file.size) })
    return `/api/galleries/local-drive?${q}`
  }
  return startUploadToFolder(folder, file, origin, 'Breaking Ice galleries')
}

/** The original's size if it landed in one of this gallery's folders, else null. */
export async function checkOriginal(g: Gallery, driveId: string) {
  const folders = new Set((g.drive?.sets ?? []).map((s) => s.folderId))
  if (local()) {
    const m = await localMeta(driveId)
    return m && folders.has(m.folder) && m.size > 0 ? m.size : null
  }
  if (!/^[\w-]{10,100}$/.test(driveId)) return null
  const f = await fileMeta(driveId)
  return f && f.size && (f.parents ?? []).some((p) => folders.has(p)) ? Number(f.size) : null
}

/** The original's bytes, from Drive (or the local stand-in). Null when it's gone from Drive. */
export async function originalStream(p: GalleryPhoto): Promise<{ body: ReadableStream<Uint8Array>; size?: number } | null> {
  if (!p.driveId) return null
  if (local()) {
    try {
      const buf = await readFile(localPath(p.driveId))
      return { body: new Blob([new Uint8Array(buf)]).stream(), size: buf.length }
    } catch {
      return null
    }
  }
  try {
    const { res } = await downloadStream({ id: p.driveId, name: p.name, mimeType: mimeOf(p) })
    if (!res.body) return null
    const len = Number(res.headers.get('content-length'))
    return { body: res.body, size: Number.isFinite(len) && len > 0 ? len : undefined }
  } catch (e) {
    console.error('[galleries] drive original unavailable', p.driveId, e)
    return null
  }
}
