'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { sendResumable } from '@/portal/resumable'
import { formatBytes, MAX_PHOTO_BYTES, PHOTO_TYPES, THUMB_EDGE, WEB_EDGE, type GallerySet } from '../types'

/**
 * Adds a shoot to a gallery straight from Josh's browser.
 *
 * For each photo: read it once (turned upright from its EXIF orientation), note its size, draw a
 * ~2048 px web copy and an ~800 px thumbnail as JPEGs, then PUT all three files to storage.
 * Addresses are signed 50 photos at a time; 3 photos are in flight at once; every PUT is retried
 * twice. Finished photos are registered with the gallery in small batches as they land, so a
 * cancelled or interrupted upload keeps everything that finished. Bitmaps and canvases are
 * released as soon as they're used, so a 1000-photo shoot doesn't pile up in memory.
 */

const SIGN_BATCH = 50
const REGISTER_BATCH = 10
const PARALLEL = 3
const QUALITY = 0.82
const EXT_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

type Signed = { ok: true; key: string; ext: string; urls: { orig: string; web: string; thumb: string }; /** Resumable upload address in Google Drive for the original. */ drive?: string } | { ok: false; error: string }
type Reg = { key: string; ext: string; name: string; set: string; w: number; h: number; size: number; webSize: number; order: number; driveId?: string }
type Failure = { name: string; why: string }
type Progress = { total: number; done: number; failed: number; bytesTotal: number; bytesDone: number }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const typeOf = (f: File) => (f.type && (PHOTO_TYPES as readonly string[]).includes(f.type) ? f.type : EXT_TYPE[/\.([a-z]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? ''] ?? '')
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

async function api(id: string, body: unknown) {
  const r = await fetch(`/api/admin/galleries/${encodeURIComponent(id)}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  return { ...j, ok: r.ok && j.ok !== false, status: r.status } as { ok: boolean; status: number; error?: string; items?: unknown; missing?: unknown }
}

/** Every file in a dropped folder (and its sub-folders). */
async function walk(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return new Promise((res) => (entry as FileSystemFileEntry).file((f) => res([f]), () => res([])))
  if (!entry.isDirectory) return []
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const all: FileSystemEntry[] = []
  // readEntries hands back at most ~100 at a time; keep asking until it returns none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries(res, () => res([])))
    if (!batch.length) break
    all.push(...batch)
  }
  return (await Promise.all(all.map(walk))).flat()
}

/** A JPEG of the source scaled so its long edge is at most `edge` (never upscaled). */
async function scaled(src: CanvasImageSource & { width: number; height: number }, edge: number): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const s = Math.min(1, edge / Math.max(src.width, src.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(src.width * s))
  canvas.height = Math.max(1, Math.round(src.height * s))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no-canvas')
  // White under transparent PNGs, or they'd turn black as JPEGs.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('no-jpeg')
  return { blob, canvas }
}

const free = (c: HTMLCanvasElement) => {
  c.width = 0
  c.height = 0
}

/** The original's pixel size plus its web copy and thumbnail. The thumbnail is drawn from the web copy: sharper, and quicker. */
async function copies(file: File) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const w = bmp.width
    const h = bmp.height
    const web = await scaled(bmp, WEB_EDGE)
    bmp.close()
    try {
      const thumb = await scaled(web.canvas, THUMB_EDGE)
      free(thumb.canvas)
      return { w, h, web: web.blob, thumb: thumb.blob }
    } finally {
      free(web.canvas)
    }
  } finally {
    bmp.close()
  }
}

/** The original, straight to Google Drive in chunks (resumes after a dropped connection). Returns its Drive file id. */
async function toDrive(session: string, file: File, signal: AbortSignal, onBytes: (n: number) => void) {
  let xhr: XMLHttpRequest | null = null
  const stop = () => xhr?.abort()
  signal.addEventListener('abort', stop)
  try {
    const r = await sendResumable({ file, session, from: 0, cancelled: () => signal.aborted, onProgress: onBytes, onPause: () => {}, onXhr: (x) => (xhr = x) })
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
    if (!r.ok || !r.id) throw new Error(r.ok ? 'Google Drive didn’t return the file' : r.reason === 'unsteady' ? 'connection kept dropping' : 'Google Drive upload failed')
    return r.id
  } finally {
    signal.removeEventListener('abort', stop)
  }
}

/** One PUT, tried up to three times. Client errors other than timeouts and throttling aren't retried. */
async function put(url: string, body: Blob, type: string, signal: AbortSignal) {
  let last = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
    try {
      const r = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': type }, signal })
      if (r.ok) return
      last = `storage said ${r.status}`
      if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) break
    } catch (e) {
      if (signal.aborted) throw e
      last = 'connection dropped'
    }
    await wait(1000 * (attempt + 1))
  }
  throw new Error(last || 'upload failed')
}

export function Uploader({ id, sets, sample, ro }: { id: string; sets: GallerySet[]; sample: boolean; ro: boolean }) {
  const router = useRouter()
  const [setKey, setSetKey] = useState(sets[0]?._key ?? '')
  const [running, setRunning] = useState(false)
  const [over, setOver] = useState(false)
  const [p, setP] = useState<Progress | null>(null)
  const [fails, setFails] = useState<Failure[]>([])
  const [note, setNote] = useState('')
  const abort = useRef<AbortController | null>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const target = sets.some((s) => s._key === setKey) ? setKey : sets[0]?._key ?? ''

  // React doesn't know the folder-picker attribute, so set it by hand.
  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '')
    folderInput.current?.setAttribute('directory', '')
  }, [])

  // Leaving mid-upload would strand the photos in flight.
  useEffect(() => {
    if (!running) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

  async function start(input: File[]) {
    if (running || ro) return
    const photos: File[] = []
    const failures: Failure[] = []
    let skipped = 0
    for (const f of input) {
      if (f.name.startsWith('.')) continue
      if (!typeOf(f)) skipped++
      else if (f.size > MAX_PHOTO_BYTES) failures.push({ name: f.name, why: `over ${formatBytes(MAX_PHOTO_BYTES)}` })
      else if (!f.size) failures.push({ name: f.name, why: 'empty file' })
      else photos.push(f)
    }
    photos.sort(byName)
    setFails(failures)
    setNote(skipped ? `Skipped ${skipped} ${skipped === 1 ? 'file' : 'files'} that aren’t JPEG, PNG or WebP.` : '')
    if (!photos.length) {
      if (!skipped && !failures.length) setNote('No photos found there.')
      return
    }

    const ctl = new AbortController()
    abort.current = ctl
    const set = target
    const prog: Progress = { total: photos.length, done: 0, failed: failures.length, bytesTotal: photos.reduce((n, f) => n + f.size, 0), bytesDone: 0 }
    const show = () => setP({ ...prog })
    const fail = (name: string, why: string) => {
      prog.failed++
      failures.push({ name, why })
      setFails([...failures])
      show()
    }
    setRunning(true)
    show()

    // Registration runs one batch at a time, in the background, while uploads carry on.
    const pending: Reg[] = []
    const names = new Map<string, string>()
    let chain: Promise<void> = Promise.resolve()
    const register = async (batch: Reg[]) => {
      batch.sort((a, b) => a.order - b.order)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await api(id, { action: 'register', photos: batch })
          if (r.ok) {
            const missing = Array.isArray(r.missing) ? (r.missing as string[]) : []
            for (const k of missing) fail(names.get(k) ?? k, 'uploaded, but storage didn’t confirm the files')
            prog.done += batch.length - missing.length
            show()
            return
          }
          if (r.status === 400 || r.status === 401 || r.status === 404) break
        } catch {
          /* try again */
        }
        await wait(1500 * (attempt + 1))
      }
      for (const b of batch) fail(b.name, 'uploaded, but couldn’t be added to the gallery')
    }
    const flush = (all = false) => {
      while (pending.length >= REGISTER_BATCH || (all && pending.length)) {
        const batch = pending.splice(0, SIGN_BATCH)
        chain = chain.then(() => register(batch))
      }
    }

    let fatal = ''
    try {
      for (let i = 0; i < photos.length && !ctl.signal.aborted && !fatal; i += SIGN_BATCH) {
        const chunk = photos.slice(i, i + SIGN_BATCH)
        const signed = await api(id, { action: 'sign', set, files: chunk.map((f) => ({ name: f.name, type: typeOf(f), size: f.size })) }).catch(() => null)
        if (!signed?.ok || !Array.isArray(signed.items)) {
          const err = String(signed?.error ?? '')
          fatal =
            err === 'sample'
              ? 'This is the made-up sample shoot, so uploads can’t show here. Make a new gallery to try the uploader.'
              : err === 'not-configured'
                ? 'Photo storage isn’t set up on this server yet (R2 settings are missing).'
                : err === 'drive-not-configured' || err === 'drive'
                  ? 'Couldn’t reach Google Drive for the originals. Check the Drive connection in Settings, then try again.'
                : signed?.status === 401
                  ? 'This sign-in can’t upload, or it has expired.'
                  : 'Couldn’t get upload addresses from the server.'
          for (const f of photos.slice(i)) fail(f.name, 'not uploaded')
          break
        }
        const items = signed.items as Signed[]
        let next = 0
        await Promise.all(
          Array.from({ length: Math.min(PARALLEL, chunk.length) }, async () => {
            while (next < chunk.length && !ctl.signal.aborted) {
              const at = next++
              const file = chunk[at]
              const s = items[at]
              if (!s?.ok) {
                fail(file.name, s?.error === 'size' ? 'too large' : 'not a supported photo')
                continue
              }
              try {
                const c = await copies(file)
                const [driveId] = await Promise.all([
                  s.drive ? toDrive(s.drive, file, ctl.signal, () => {}) : put(s.urls.orig, file, typeOf(file), ctl.signal).then(() => undefined),
                  put(s.urls.web, c.web, 'image/jpeg', ctl.signal),
                  put(s.urls.thumb, c.thumb, 'image/jpeg', ctl.signal),
                ])
                prog.bytesDone += file.size
                show()
                names.set(s.key, file.name)
                pending.push({ key: s.key, ext: s.ext, name: file.name, set, w: c.w, h: c.h, size: file.size, webSize: c.web.size, order: i + at, ...(driveId ? { driveId } : {}) })
                flush()
              } catch (e) {
                if (ctl.signal.aborted) return
                const why = e instanceof Error && (e.message.startsWith('storage') || /Drive|connection/.test(e.message)) ? e.message : e instanceof Error && /decode|InvalidState|no-/i.test(`${e.name} ${e.message}`) ? 'couldn’t read the image' : e instanceof Error ? e.message : 'failed'
                fail(file.name, why)
              }
            }
          }),
        )
      }
    } finally {
      // Whatever finished (even after Cancel) still gets added.
      flush(true)
      await chain
      const cancelled = ctl.signal.aborted
      abort.current = null
      setRunning(false)
      setNote(
        fatal ||
          (cancelled
            ? `Cancelled. ${prog.done} ${prog.done === 1 ? 'photo was' : 'photos were'} added before stopping.`
            : `Done: ${prog.done} of ${prog.total} added${prog.failed ? `, ${prog.failed} didn’t make it (listed below)` : ''}.`),
      )
      router.refresh()
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setOver(false)
    if (running || ro) return
    // Entries must be collected before the first await: the drop's item list goes stale after the event.
    const entries = [...e.dataTransfer.items].map((it) => (it.kind === 'file' ? it.webkitGetAsEntry?.() : null)).filter((x): x is FileSystemEntry => Boolean(x))
    const files = entries.length ? (await Promise.all(entries.map(walk))).flat() : [...e.dataTransfer.files]
    void start(files)
  }

  const pct = p && p.total ? Math.round(((p.done + p.failed) / p.total) * 100) : 0

  if (ro) return null
  return (
    <section className="p-card ga-panel ga-uploader" aria-labelledby="ga-up-h">
      <div className="a-card-head">
        <h2 id="ga-up-h" className="a-h2">Add photos</h2>
        <span className="muted small">JPEG, PNG or WebP, up to {formatBytes(MAX_PHOTO_BYTES)} each</span>
      </div>
      {sample && <p className="a-warning" style={{ margin: 0 }}>This is the made-up sample shoot. Make a new gallery to try uploading.</p>}
      <div className="ga-up-target">
        <label htmlFor="ga-up-set" className="small">Add to set</label>
        <select id="ga-up-set" className="input a-select" value={target} onChange={(e) => setSetKey(e.target.value)} disabled={running}>
          {sets.map((s) => (
            <option key={s._key} value={s._key}>{s.title}</option>
          ))}
        </select>
      </div>
      <div
        className={`ga-drop ${over ? 'over' : ''} ${running ? 'busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          if (!running) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <p style={{ margin: 0 }}><strong>Drop photos or a whole folder here</strong></p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={running}>Choose photos</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => folderInput.current?.click()} disabled={running}>Choose a folder</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          hidden
          onChange={(e) => {
            const list = [...(e.target.files ?? [])]
            e.target.value = ''
            void start(list)
          }}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const list = [...(e.target.files ?? [])]
            e.target.value = ''
            void start(list)
          }}
        />
      </div>

      {p && (
        <div className="ga-progress" aria-live="polite">
          <progress max={100} value={pct} aria-label="Upload progress" />
          <p className="small" style={{ margin: 0 }}>
            {running ? 'Uploading: ' : ''}
            {p.done} of {p.total} added · {formatBytes(p.bytesDone)} of {formatBytes(p.bytesTotal)}
            {p.failed ? ` · ${p.failed} failed` : ''}
          </p>
          {running && (
            <div className="btn-row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => abort.current?.abort()}>Cancel</button>
              <span className="muted small">Keep this tab open until it finishes.</span>
            </div>
          )}
        </div>
      )}
      {note && <p className="small" role="status" style={{ margin: 0 }}>{note}</p>}
      {fails.length > 0 && (
        <details className="ga-fails" open={fails.length <= 5}>
          <summary className="small">{fails.length} {fails.length === 1 ? 'file' : 'files'} not added</summary>
          <ul className="small">
            {fails.slice(0, 100).map((f, i) => (
              <li key={`${f.name}-${i}`}><span className="ga-mono">{f.name}</span> <span className="muted">· {f.why}</span></li>
            ))}
            {fails.length > 100 && <li className="muted">and {fails.length - 100} more</li>}
          </ul>
        </details>
      )}
    </section>
  )
}
