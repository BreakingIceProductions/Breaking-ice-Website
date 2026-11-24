'use client'

import { useRef, useState } from 'react'
import { fmtEta, fmtSize } from '@/portal/resumable'
import { REVIEW_FPS } from '@/portal/types'

/**
 * "Upload for review": an H.264 MP4 goes straight from the browser to our R2 bucket in
 * 8–16 MB parts, three at a time, each retried if it fails. The file's length and size
 * are read here first with a hidden video element. Parts already sent are remembered in
 * this browser, so after a reload choosing the same file again carries on where it stopped.
 * A thumbnail is grabbed from the video here too and goes up next to it; if that fails, the
 * version simply has no thumbnail. "Upload for delivery" is the same upload with delivery: true.
 */

type Meta = { duration: number; width: number; height: number }
type Started = { objectKey: string; uploadId: string; deliverableKey: string; version: number; partSize: number; sample?: boolean }
type Saved = Started & { title: string; parts: Record<number, string> }

const post = (action: string, body: unknown) =>
  fetch(`/api/admin/r2/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, status: r.status, ...(await r.json().catch(() => ({}))) }))
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const storeKey = (projectId: string, f: File) => `bi-r2-up:${projectId}:${f.name}:${f.size}:${f.lastModified}`
const load = (k: string): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null')
  } catch {
    return null
  }
}
const save = (k: string, v: Saved | null) => {
  try {
    if (v) localStorage.setItem(k, JSON.stringify(v))
    else localStorage.removeItem(k)
  } catch {
    /* private window: no resume, still uploads */
  }
}

function readMeta(file: File): Promise<Meta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const done = () => URL.revokeObjectURL(url)
    v.onloadedmetadata = () => {
      const m = { duration: v.duration, width: v.videoWidth, height: v.videoHeight }
      done()
      if (!Number.isFinite(m.duration) || !m.width) reject(new Error('unreadable'))
      else resolve(m)
    }
    v.onerror = () => {
      done()
      reject(new Error('unreadable'))
    }
    v.src = url
  })
}

/**
 * A JPEG of one frame, 1280 px wide: about 10% in, or 3 s if that's earlier (never before 0.5 s),
 * to skip black first frames. Resolves null if the browser can't do it; it's never a reason to stop.
 */
function grabThumb(file: File, duration: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'auto'
    v.muted = true
    v.playsInline = true
    let settled = false
    const done = (b: Blob | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      v.removeAttribute('src')
      v.load()
      resolve(b)
    }
    const timer = setTimeout(() => done(null), 15_000)
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(Math.max(0.5, Math.min(duration * 0.1, 3)), Math.max(0, duration - 0.1))
    }
    v.onseeked = () => {
      try {
        const w = 1280
        const h = Math.round((w * v.videoHeight) / Math.max(1, v.videoWidth)) || 720
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        if (!ctx) return done(null)
        ctx.drawImage(v, 0, 0, w, h)
        c.toBlob((b) => done(b), 'image/jpeg', 0.82)
      } catch {
        done(null)
      }
    }
    v.onerror = () => done(null)
    v.src = url
  })
}

/** Grabs the thumbnail and puts it next to the video. Resolves with its key, or undefined on any failure. */
async function uploadThumb(projectId: string, s: Started, file: File, duration: number): Promise<string | undefined> {
  try {
    const blob = await grabThumb(file, duration)
    if (!blob) return undefined
    const r = await post('thumb', { projectId, objectKey: s.objectKey, uploadId: s.uploadId })
    if (!r.ok || !r.url || !r.key) return undefined
    const put = await fetch(r.url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
    return put.ok ? (r.key as string) : undefined
  } catch {
    return undefined
  }
}

/** One PUT of one part. Resolves with the ETag R2 gives back. */
function putPart(url: string, blob: Blob, onBytes: (n: number) => void, track: (x: XMLHttpRequest) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    track(xhr)
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => onBytes(e.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag')
        if (etag) resolve(etag)
        else reject(new Error('no-etag'))
      } else reject(new Error(`status-${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('network'))
    xhr.onabort = () => reject(new Error('aborted'))
    xhr.send(blob)
  })
}

export function R2Upload({ projectId, title, notes, send, delivery = false, onAdded }: { projectId: string; title: string; notes: string; send: boolean; delivery?: boolean; onAdded: (msg: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [fps, setFps] = useState<number>(23.976)
  const [state, setState] = useState<'idle' | 'uploading' | 'finishing' | 'error'>('idle')
  const [sent, setSent] = useState(0)
  const [note, setNote] = useState('')
  const cancelled = useRef(false)
  const xhrs = useRef(new Set<XMLHttpRequest>())
  const current = useRef<Started | null>(null)
  const thumb = useRef<Promise<string | undefined> | null>(null)

  async function choose(f: File) {
    setFile(null)
    setMeta(null)
    setNote('')
    setState('idle')
    if (!/\.mp4$/i.test(f.name) && f.type !== 'video/mp4') return setNote('Pick an MP4 (H.264). Export one from Resolve first.')
    try {
      setMeta(await readMeta(f))
      setFile(f)
      const saved = load(storeKey(projectId, f))
      if (saved) setNote(`Part of this file is already up (${Object.keys(saved.parts).length} pieces). Uploading carries on from there.`)
    } catch {
      setNote('This browser can’t read that file. Is it an H.264 MP4?')
    }
  }

  async function start() {
    if (!file || !meta || !title.trim()) return
    cancelled.current = false
    setState('uploading')
    setSent(0)
    setNote('')
    const k = storeKey(projectId, file)
    let saved = load(k)
    if (saved && saved.title !== title.trim()) saved = null
    let s: Started
    if (saved) s = saved
    else {
      const r = await post('start', { projectId, title: title.trim(), name: file.name, size: file.size, type: file.type })
      if (!r.ok) {
        setState('error')
        return setNote(r.error === 'too-big' ? 'That file is over 100 GB.' : r.error === 'not-configured' ? 'Review storage isn’t set up yet (see Settings).' : 'Couldn’t start the upload. Try again.')
      }
      s = r as Started
      saved = { ...s, title: title.trim(), parts: {} }
      if (!s.sample) save(k, saved)
    }
    current.current = s
    // The thumbnail goes up alongside the parts; finish() waits for it, and a failure only means no thumbnail.
    thumb.current = s.sample ? null : uploadThumb(projectId, s, file, meta.duration)
    const total = Math.ceil(file.size / s.partSize)
    const t0 = Date.now()

    // Sample mode: show the progress without sending anything.
    if (s.sample) {
      for (let i = 1; i <= 20 && !cancelled.current; i++) {
        await wait(80)
        setSent(Math.round((file.size * i) / 20))
      }
      if (cancelled.current) return
      return finish(s, [], k)
    }

    const parts: Record<number, string> = { ...saved!.parts }
    const progress: Record<number, number> = {}
    for (const n of Object.keys(parts)) progress[Number(n)] = Math.min(s.partSize, file.size - (Number(n) - 1) * s.partSize)
    const report = () => {
      const bytes = Object.values(progress).reduce((a, b) => a + b, 0)
      setSent(bytes)
      const rate = bytes / Math.max(1, (Date.now() - t0) / 1000)
      setNote(rate > 0 && bytes < file.size ? fmtEta((file.size - bytes) / rate) : '')
    }
    report()
    const todo = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !parts[n])
    const urls: Record<number, string> = {}
    const urlFor = async (n: number, fresh = false) => {
      if (urls[n] && !fresh) return urls[n]
      const batch = fresh ? [n] : todo.filter((x) => x >= n && !urls[x]).slice(0, 50)
      const r = await post('parts', { projectId, objectKey: s.objectKey, uploadId: s.uploadId, parts: batch })
      if (!r.ok) throw new Error('presign')
      Object.assign(urls, r.urls)
      return urls[n]
    }

    let failed = ''
    const worker = async () => {
      while (todo.length && !cancelled.current && !failed) {
        const n = todo.shift()!
        const blob = file.slice((n - 1) * s.partSize, Math.min(file.size, n * s.partSize))
        for (let attempt = 0; ; attempt++) {
          try {
            const url = await urlFor(n, attempt > 0)
            let x: XMLHttpRequest | null = null
            const etag = await putPart(url, blob, (b) => { progress[n] = b; report() }, (xhr) => { x = xhr; xhrs.current.add(xhr) })
            if (x) xhrs.current.delete(x)
            parts[n] = etag
            progress[n] = blob.size
            save(k, { ...saved!, parts })
            report()
            break
          } catch (e) {
            if (cancelled.current) return
            const msg = String((e as Error).message)
            if (msg === 'no-etag') return void (failed = 'The storage bucket isn’t letting the browser read upload receipts (ETag). Check its CORS settings in docs/r2-setup.md.')
            if (msg === 'status-404') return void (failed = 'expired')
            progress[n] = 0
            if (attempt >= 4) return void (failed = 'A piece of the file kept failing. Check the connection and try again: it carries on from where it stopped.')
            setNote(navigator.onLine ? 'Retrying a piece…' : 'Waiting for your connection…')
            await wait(Math.min(20_000, 1000 * 2 ** attempt))
            while (!navigator.onLine && !cancelled.current) await wait(2000)
          }
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
    if (cancelled.current) return
    if (failed === 'expired') {
      // The unfinished upload is gone on R2's side: start again from scratch next time.
      save(k, null)
      setState('error')
      return setNote('That earlier upload had expired. Press Upload again to start over.')
    }
    if (failed) {
      setState('error')
      return setNote(failed)
    }
    await finish(s, Object.entries(parts).map(([n, etag]) => ({ n: Number(n), etag })), k)
  }

  async function finish(s: Started, parts: { n: number; etag: string }[], k: string) {
    setState('finishing')
    setNote('Finishing…')
    const thumbKey = thumb.current ? await thumb.current.catch(() => undefined) : undefined
    const r = await post('complete', {
      projectId,
      objectKey: s.objectKey,
      uploadId: s.uploadId,
      deliverableKey: s.deliverableKey,
      parts,
      title: title.trim(),
      notes,
      send,
      delivery,
      thumbKey,
      fps,
      durationSec: meta?.duration,
      width: meta?.width,
      height: meta?.height,
    })
    if (!r.ok) {
      setState('error')
      return setNote('Uploaded, but couldn’t add the version. Try again (the upload carries on from where it is).')
    }
    save(k, null)
    setState('idle')
    setFile(null)
    setMeta(null)
    setSent(0)
    setNote('')
    current.current = null
    thumb.current = null
    const base = r.sample ? 'Sample mode: nothing was uploaded or saved.' : send ? 'Uploaded and sent. The client gets the email after the 10-minute hold.' : 'Uploaded, not sent yet.'
    const copy = !delivery || r.sample ? '' : r.vimeo === 'failed' ? ` The Vimeo copy didn’t start: ${r.vimeoError ?? 'unknown problem'}` : ' Copying to Vimeo now.'
    onAdded(base + copy)
  }

  async function cancel() {
    cancelled.current = true
    for (const x of xhrs.current) x.abort()
    xhrs.current.clear()
    const s = current.current
    if (s && file) {
      save(storeKey(projectId, file), null)
      if (!s.sample) await post('abort', { projectId, objectKey: s.objectKey, uploadId: s.uploadId }).catch(() => {})
    }
    current.current = null
    setState('idle')
    setSent(0)
    setNote('Cancelled. Nothing was kept.')
  }

  const pct = file?.size ? Math.floor((sent / file.size) * 100) : 0
  const busy = state === 'uploading' || state === 'finishing'
  const mins = meta ? `${Math.floor(meta.duration / 60)}:${String(Math.floor(meta.duration % 60)).padStart(2, '0')}` : ''

  return (
    <div className="stack gap-3">
      <div className="dropzone dropzone-compact">
        <p className="m0">
          {file ? <strong>{file.name}</strong> : <strong>{delivery ? 'The final MP4' : 'An MP4 review copy'}</strong>}{' '}
          {!busy && <button type="button" className="linklike" onClick={() => input.current?.click()}>{file ? 'choose another' : 'choose a file'}</button>}
        </p>
        <p className="muted small m0">{meta && file ? `${mins} · ${meta.width}×${meta.height} · ${fmtSize(file.size)}` : 'H.264 MP4. It plays as uploaded: nothing is re-encoded.'}</p>
        <input ref={input} type="file" accept="video/mp4,.mp4" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = '' }} />
      </div>
      {file && (
        <label className="small muted inline-row">
          Frame rate (for timecode)
          <select className="input a-select" style={{ width: 'auto', minHeight: 36 }} value={fps} disabled={busy} onChange={(e) => setFps(Number(e.target.value))}>
            {REVIEW_FPS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      )}
      {busy && (
        <div className="upload up-uploading">
          <div className="up-top">
            <span className="fname">{state === 'finishing' ? 'Finishing…' : 'Uploading'}</span>
            <span className="muted small">{pct}%{note ? ` · ${note}` : ''}</span>
          </div>
          <div className="up-bar" role="progressbar" aria-label={`Uploading ${file?.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>
          {state === 'uploading' && <div className="up-actions"><button type="button" className="linklike small" onClick={cancel}>Cancel</button></div>}
        </div>
      )}
      {!busy && note && <p className="small muted m0" role="status">{note}</p>}
      {!busy && (
        <div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!file || !meta || !title.trim()} onClick={start}>{delivery ? 'Upload for delivery' : 'Upload for review'}</button>
          {!title.trim() && file && <span className="small muted"> Add a title first.</span>}
        </div>
      )}
    </div>
  )
}
