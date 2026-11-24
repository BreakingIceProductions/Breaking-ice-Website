'use client'

/* eslint-disable @next/next/no-img-element -- signed storage addresses */
import { useEffect, useRef, useState } from 'react'
import { frameAt, frameStart, timecode } from '@/portal/timecode'

const post = (body: unknown) =>
  fetch('/api/admin/thumb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))

/**
 * Pick a review-room video's thumbnail: scrub or step frame by frame, then "Use this frame".
 * The frame goes up as a 1280-px JPEG, becomes the version's thumbnail, and the same moment is set on its Vimeo copy.
 */
export function ThumbPicker({ projectId, versionKey, fps = 23.976, current, start = 0, onDone, onClose }: {
  projectId: string
  versionKey: string
  fps?: number
  current?: string
  start?: number
  onDone: () => void
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState('')
  const [t, setT] = useState(start)
  const [duration, setDuration] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // The same signed address the review room plays, asked for as the owner.
  useEffect(() => {
    let live = true
    const q = new URLSearchParams({ via: 'admin', project: projectId, key: versionKey })
    fetch(`/api/review/play?${q}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { url?: string }) => { if (live) j.url ? setSrc(j.url) : setMsg('The video couldn’t be loaded.') })
      .catch(() => live && setMsg('The video couldn’t be loaded.'))
    return () => { live = false }
  }, [projectId, versionKey])

  useEffect(() => {
    const v = video.current
    if (!v || !src) return
    v.crossOrigin = 'anonymous'
    v.src = src
    v.load()
  }, [src])

  const seek = (to: number) => {
    const v = video.current
    if (!v) return
    const clamped = Math.min(Math.max(0, to), duration || v.duration || 0)
    v.currentTime = clamped
    setT(clamped)
  }
  const step = (n: number) => seek(frameStart(frameAt(t, fps) + n, fps) + 0.0005)

  async function use() {
    const v = video.current
    if (!v || !v.videoWidth) return
    setBusy(true)
    setMsg('')
    try {
      const w = 1280
      const c = document.createElement('canvas')
      c.width = w
      c.height = Math.round((w * v.videoHeight) / v.videoWidth)
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85))
      if (!blob) throw new Error('grab')
      const s = await post({ action: 'start', projectId, key: versionKey })
      if (!s.ok) throw new Error('start')
      if (!s.sample) {
        const put = await fetch(s.url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
        if (!put.ok) throw new Error('put')
      }
      const r = await post({ action: 'save', projectId, key: versionKey, thumbKey: s.key, seconds: v.currentTime })
      if (!r.ok) throw new Error('save')
      setMsg(`Thumbnail set.${r.vimeo === 'set' ? ' Vimeo too.' : r.vimeoError ? ` Vimeo: ${r.vimeoError}` : ''}${r.sample ? ' (Sample mode: nothing was saved.)' : ''}`)
      onDone()
    } catch (e) {
      // A canvas that can't be read means the storage didn't allow the browser to read the frame (CORS).
      setMsg((e as Error).name === 'SecurityError' ? 'The browser wasn’t allowed to read the frame (storage CORS). Nothing was changed.' : 'Couldn’t set the thumbnail. Try again.')
    }
    setBusy(false)
  }

  return (
    <div className="stack gap-3 thumb-picker">
      <div className="thumb-picker-media">
        {src ? (
          // No src prop: the effect below sets crossOrigin first, then the address. A load that starts
          // without crossOrigin can never be read back into a canvas ("tainted"), which is what failed before.
          <video
            key={src}
            ref={video}
            crossOrigin="anonymous"
            playsInline
            muted
            preload="auto"
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0)
              if (start) e.currentTarget.currentTime = start
            }}
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            onSeeked={(e) => setT(e.currentTarget.currentTime)}
            style={{ width: '100%', aspectRatio: '16 / 9', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-md)' }}
          />
        ) : (
          <div style={{ width: '100%', aspectRatio: '16 / 9', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-md)' }} aria-hidden="true" />
        )}
      </div>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={1 / fps}
        value={Math.min(t, duration || 0)}
        disabled={!duration || busy}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Position in the video"
      />
      <div className="btn-row" style={{ alignItems: 'center' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => step(-1)} disabled={!duration || busy} aria-label="Back one frame">←</button>
        <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{timecode(frameAt(t, fps), fps)}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => step(1)} disabled={!duration || busy} aria-label="Forward one frame">→</button>
      </div>
      {current && (
        <figure className="m0 stack gap-1" style={{ maxWidth: 200 }}>
          <img src={current} alt="" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
          <figcaption className="muted small">Current</figcaption>
        </figure>
      )}
      <div className="btn-row">
        <button type="button" className="btn btn-primary btn-sm" onClick={use} disabled={!duration || busy}>{busy ? 'Saving…' : 'Use this frame'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
      {msg && <p className="small muted m0" role="status">{msg}</p>}
    </div>
  )
}
