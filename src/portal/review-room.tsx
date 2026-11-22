'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clockTime, frameAt, frameMiddle, frameOf, frameStart, spokenTime, timecode } from './timecode'
import type { DeliverableStatus, ReviewComment, ReviewShape } from './types'
import { useConfirmDialog } from '@/admin/ui/confirm'
import { Initials } from '@/admin/ui/viz'
import './review-room.css'

/**
 * The review room: our own player with frame-accurate timecode, time-coded comments
 * (a frame or an in–out range), drawings on the paused frame, threaded replies, and
 * for portal contacts the Approve / Request changes bar. One component, three doors:
 * the client portal, a guest share link, and the back office.
 */

export type RoomVia = 'portal' | 'share' | 'admin'

type Props = {
  via: RoomVia
  /** Portal: the project slug. Admin: the project id. Share: unused. */
  project?: string
  deliverableKey: string
  token?: string
  title: string
  versionLabel: string
  fps: number
  duration?: number
  status: DeliverableStatus
  /** Portal contacts can approve or ask for changes. */
  canDecide?: boolean
  /** Watching only (view-only back office, or the back office viewing as the client). */
  readOnly?: boolean
  /** Guests: the name they gave and their random browser id. */
  guest?: { name: string; id: string }
  /** Shown above the comments, e.g. the note to the client. */
  note?: string
}

const COLORS = [
  { value: '#e5484d', name: 'Red' },
  { value: '#f5a524', name: 'Amber' },
  { value: '#30a46c', name: 'Green' },
  { value: '#3e8ef7', name: 'Blue' },
  { value: '#ffffff', name: 'White' },
]
const SPEEDS = [0.5, 1, 1.5, 2]
const POLL_MS = 15_000
const EDIT_MS = 15 * 60_000
type Tool = ReviewShape['type'] | null
type Filter = 'all' | 'open' | 'done'

const STATUS_WORD: Record<DeliverableStatus, string> = {
  'in-progress': 'Not sent yet',
  'awaiting-feedback': 'Waiting for feedback',
  'changes-requested': 'Changes requested',
  approved: 'Approved',
}

const typing = (el: EventTarget | null) => {
  const e = el as HTMLElement | null
  if (!e) return false
  return e.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName)
}

export function ReviewRoom(props: Props) {
  const { via, project, deliverableKey, token, fps, title, versionLabel, guest } = props
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirmDialog('rr-confirm')
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const retried = useRef(0)

  const [src, setSrc] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(props.duration ?? 0)
  const [buffering, setBuffering] = useState(true)
  const [rate, setRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [smpte, setSmpte] = useState(true)
  const [inPt, setInPt] = useState<number | null>(null)
  const [outPt, setOutPt] = useState<number | null>(null)
  const [loop, setLoop] = useState(false)
  const [aspect, setAspect] = useState(16 / 9)
  const [pic, setPic] = useState({ x: 0, y: 0, w: 0, h: 0 })

  const [comments, setComments] = useState<ReviewComment[]>([])
  const [sample, setSample] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [tool, setTool] = useState<Tool>(null)
  const [color, setColor] = useState(COLORS[0].value)
  const [draft, setDraft] = useState<ReviewShape[]>([])
  const [draftFrame, setDraftFrame] = useState<number | null>(null)
  const [drawingNow, setDrawingNow] = useState<ReviewShape | null>(null)
  const [busy, setBusy] = useState(false)
  const [say, setSay] = useState('')

  const frame = frameAt(time, fps)
  const canWrite = !props.readOnly && (via !== 'share' || Boolean(guest?.name))

  /* ── Talking to the server ─────────────────────────────────────────── */

  const params = useMemo(() => ({ via, project, key: deliverableKey, token }), [via, project, deliverableKey, token])
  const query = useMemo(() => {
    const q = new URLSearchParams({ via, key: deliverableKey })
    if (project) q.set('project', project)
    if (token) q.set('token', token)
    return q.toString()
  }, [via, project, deliverableKey, token])
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...(guest?.id ? { 'x-review-guest': guest.id } : {}) }), [guest?.id])

  const loadSrc = useCallback(async () => {
    const r = await fetch(`/api/review/play?${query}`, { cache: 'no-store' }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { url?: string; error?: string } | null
    if (r?.ok && j?.url) {
      setSrc(j.url)
      setLoadError('')
    } else setLoadError(j?.error === 'not-ready' ? 'This video isn’t ready to play yet.' : 'The video couldn’t be loaded. Reload the page to try again.')
  }, [query])

  const loadComments = useCallback(async () => {
    const r = await fetch(`/api/review/comments?${query}`, { cache: 'no-store', headers }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { comments?: ReviewComment[]; sample?: boolean } | null
    if (!r?.ok || !j?.comments) return
    setSample(Boolean(j.sample))
    setComments((old) => (j.sample && old.length ? old : j.comments!))
    setLoaded(true)
  }, [query, headers])

  useEffect(() => {
    loadSrc()
    loadComments()
  }, [loadSrc, loadComments])

  // New comments every 15 seconds while the tab is in front (sample comments live only here).
  useEffect(() => {
    if (sample) return
    const tick = () => document.visibilityState === 'visible' && loadComments()
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [sample, loadComments])

  const send = useCallback(
    async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) => {
      const r = await fetch('/api/review/comments', {
        method,
        headers,
        body: JSON.stringify({ ...params, guestName: guest?.name, ...body }),
      }).catch(() => null)
      const j = (await r?.json().catch(() => null)) as { comment?: ReviewComment; error?: string } | null
      return { ok: Boolean(r?.ok), status: r?.status ?? 0, ...j }
    },
    [headers, params, guest?.name],
  )

  /* ── Player ────────────────────────────────────────────────────────── */

  const v = () => video.current
  const seekFrame = useCallback(
    (f: number) => {
      const el = video.current
      if (!el) return
      const max = el.duration && Number.isFinite(el.duration) ? frameAt(el.duration, fps) - 1 : Infinity
      const target = Math.max(0, Math.min(max, f))
      el.currentTime = frameMiddle(target, fps)
      setTime(frameMiddle(target, fps))
    },
    [fps],
  )
  const pause = () => v()?.pause()
  const toggle = useCallback(() => {
    const el = video.current
    if (!el) return
    if (el.paused) {
      setTool(null)
      el.play().catch(() => {})
    } else el.pause()
  }, [])
  const step = useCallback(
    (frames: number) => {
      const el = video.current
      if (!el) return
      el.pause()
      seekFrame(frameAt(el.currentTime, fps) + frames)
    },
    [fps, seekFrame],
  )

  // Follow the picture: requestVideoFrameCallback gives the exact frame on screen while playing.
  useEffect(() => {
    const el = video.current
    if (!el) return
    type RVFC = (cb: (now: number, meta: { mediaTime: number }) => void) => number
    const rvfc = (el as unknown as { requestVideoFrameCallback?: RVFC }).requestVideoFrameCallback?.bind(el)
    let handle = 0
    let raf = 0
    // Only while playing: when paused, seeks set the time themselves (a late frame callback could be one seek behind).
    const onFrame = (_: number, meta: { mediaTime: number }) => {
      if (!el.paused) setTime(meta.mediaTime)
      handle = rvfc!(onFrame)
    }
    const onRaf = () => {
      if (!el.paused) setTime(el.currentTime)
      raf = requestAnimationFrame(onRaf)
    }
    if (rvfc) handle = rvfc(onFrame)
    else raf = requestAnimationFrame(onRaf)
    return () => {
      if (rvfc) (el as unknown as { cancelVideoFrameCallback?: (h: number) => void }).cancelVideoFrameCallback?.(handle)
      cancelAnimationFrame(raf)
    }
  }, [src])

  // Loop the in–out range.
  useEffect(() => {
    if (!loop || inPt === null || outPt === null || !playing) return
    if (time >= outPt) seekFrame(frameOf(inPt, fps))
  }, [time, loop, inPt, outPt, playing, fps, seekFrame])

  // Where the picture sits inside the stage (letterboxing), so drawings line up with it.
  useEffect(() => {
    const el = stage.current?.querySelector('.rr-picture') as HTMLElement | null
    if (!el) return
    const fit = () => {
      const sw = el.clientWidth
      const sh = el.clientHeight
      if (!sw || !sh) return
      const w = sw / sh > aspect ? sh * aspect : sw
      const h = sw / sh > aspect ? sh : sw / aspect
      setPic({ x: (sw - w) / 2, y: (sh - h) / 2, w, h })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  const fullscreen = () => {
    const s = stage.current
    if (!s) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else if (s.requestFullscreen) s.requestFullscreen().catch(() => {})
    else (video.current as unknown as { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.()
  }

  const setIn = useCallback(() => {
    const t = frameStart(frameAt(video.current?.currentTime ?? 0, fps), fps)
    setInPt(t)
    setOutPt((o) => (o !== null && o <= t ? null : o))
    setSay(`In point set at ${timecode(frameOf(t, fps), fps)}`)
  }, [fps])
  const setOut = useCallback(() => {
    const t = frameStart(frameAt(video.current?.currentTime ?? 0, fps), fps)
    setOutPt(t)
    setInPt((i) => (i === null || i >= t ? 0 : i))
    setSay(`Out point set at ${timecode(frameOf(t, fps), fps)}`)
  }, [fps])
  const clearRange = useCallback(() => {
    setInPt(null)
    setOutPt(null)
    setLoop(false)
    setTool(null)
  }, [])

  // Keyboard: only when the room (or nothing in particular) has focus, and never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const inRoom = Boolean(t && (t === document.body || root.current?.contains(t)))
      if (!inRoom || typing(t)) return
      const onButton = Boolean(t?.closest('button, a, [role="button"]'))
      const k = e.key
      if ((k === ' ' && !onButton) || k === 'k' || k === 'K') {
        e.preventDefault()
        if (k === ' ') toggle()
        else pause()
      } else if (k === 'l' || k === 'L') {
        const el = video.current
        if (!el) return
        if (el.paused) el.play().catch(() => {})
        else {
          const next = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(el.playbackRate) + 1)] ?? 1
          el.playbackRate = next
          setRate(next)
        }
      } else if (k === 'j' || k === 'J') {
        const el = video.current
        if (!el) return
        el.pause()
        seekFrame(frameAt(el.currentTime - 2, fps))
      } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault()
        const dir = k === 'ArrowLeft' ? -1 : 1
        step(e.shiftKey ? dir * Math.round(fps) : dir)
      } else if (k === 'i' || k === 'I') setIn()
      else if (k === 'o' || k === 'O') setOut()
      else if (k === 'm' || k === 'M') {
        e.preventDefault()
        box.current?.focus()
      } else if (k === 'Escape') clearRange()
      else if (k === 'f' || k === 'F') fullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, step, setIn, setOut, clearRange, fps, seekFrame])

  /* ── Timeline ─────────────────────────────────────────────────────── */

  const bar = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const scrubTo = (clientX: number) => {
    const el = bar.current
    if (!el || !duration) return
    const r = el.getBoundingClientRect()
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration
    seekFrame(frameAt(t, fps))
  }
  const pct = (t: number) => `${duration ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0}%`

  /* ── Comments ─────────────────────────────────────────────────────── */

  const tops = useMemo(() => comments.filter((c) => !c.parent).sort((a, b) => a.t - b.t || a.createdAt.localeCompare(b.createdAt)), [comments])
  const repliesOf = (id: string) => comments.filter((c) => c.parent === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const shown = tops.filter((c) => (filter === 'open' ? !c.done : filter === 'done' ? c.done : true))
  const openCount = tops.filter((c) => !c.done).length
  const sel = comments.find((c) => c._id === selected)

  const goTo = (c: ReviewComment) => {
    pause()
    setTool(null)
    setSelected(c._id)
    seekFrame(frameOf(c.t, fps))
    if (c.tOut !== undefined) {
      setInPt(c.t)
      setOutPt(c.tOut)
    }
  }

  // The selected comment's drawing shows while its frame (or range) is on screen.
  const selFrame = sel ? frameOf(sel.t, fps) : -1
  const showSel = Boolean(sel?.drawing?.length) && !playing && (frame === selFrame || (sel?.tOut !== undefined && frame >= selFrame && frame <= frameOf(sel.tOut, fps)))
  const showDraft = !playing && draft.length > 0 && (draftFrame === null || draftFrame === frame)

  const atFrame = draft.length && draftFrame !== null ? draftFrame : frame
  const label = inPt !== null && outPt !== null
    ? `Comment on ${timecode(frameOf(inPt, fps), fps)} – ${timecode(frameOf(outPt, fps), fps)}`
    : `Comment at ${timecode(inPt !== null ? frameOf(inPt, fps) : atFrame, fps)}`

  async function post() {
    const body = text.trim()
    if (!body || busy || !canWrite) return
    const t = inPt !== null ? inPt : frameStart(atFrame, fps)
    const tOut = inPt !== null && outPt !== null ? outPt : undefined
    const drawing = draft.length ? draft : undefined
    // Optimistic: the comment shows in the list at once (marked "Posting…") and the box clears; if it
    // doesn't go through, it comes back out of the list and what you wrote goes back in the box.
    const tempId = `pending-${Date.now()}`
    const temp: ReviewComment = { _id: tempId, deliverableKey, version: 0, t, tOut, text: body, drawing, author: { kind: via === 'admin' ? 'admin' : guest ? 'guest' : 'client', name: guest?.name ?? 'You' }, createdAt: new Date().toISOString(), mine: true }
    const kept = { draft, draftFrame, inPt, outPt, loop }
    setComments((cs) => [...cs, temp])
    setText('')
    setDraft([])
    setDraftFrame(null)
    setTool(null)
    setInPt(null)
    setOutPt(null)
    setLoop(false)
    setSelected(tempId)
    setBusy(true)
    const r = await send('POST', { t, tOut, text: body, drawing })
    setBusy(false)
    if (r.ok && r.comment) {
      setComments((cs) => cs.map((x) => (x._id === tempId ? r.comment! : x)))
      setSelected((s) => (s === tempId ? r.comment!._id : s))
      setSay(sample ? 'Comment added (sample: it isn’t saved).' : 'Comment posted.')
    } else {
      setComments((cs) => cs.filter((x) => x._id !== tempId))
      setSelected((s) => (s === tempId ? null : s))
      setText((now) => now || body)
      setDraft(kept.draft)
      setDraftFrame(kept.draftFrame)
      setInPt(kept.inPt)
      setOutPt(kept.outPt)
      setLoop(kept.loop)
      setSay(r.error === 'too-many' ? 'That’s a lot of comments at once. Wait a few minutes and try again.' : 'That comment didn’t go through. It’s back in the box: try again.')
    }
  }

  async function reply(parent: ReviewComment, body: string) {
    const r = await send('POST', { parent: parent._id, t: parent.t, text: body })
    if (r.ok && r.comment) {
      setComments((cs) => [...cs, r.comment!])
      setSay('Reply posted.')
      return true
    }
    setSay('That reply didn’t go through. Try again.')
    return false
  }

  async function markDone(c: ReviewComment, done: boolean) {
    setComments((cs) => cs.map((x) => (x._id === c._id ? { ...x, done } : x)))
    const r = await send('PATCH', { id: c._id, done })
    if (!r.ok) {
      setComments((cs) => cs.map((x) => (x._id === c._id ? { ...x, done: !done } : x)))
      setSay('That didn’t save. Try again.')
    } else setSay(done ? 'Marked done.' : 'Marked open again.')
  }

  async function edit(c: ReviewComment, body: string) {
    const r = await send('PATCH', { id: c._id, text: body })
    if (r.ok) {
      setComments((cs) => cs.map((x) => (x._id === c._id ? { ...x, text: body, editedAt: new Date().toISOString() } : x)))
      return true
    }
    setSay(r.error === 'too-late' ? 'Comments can only be changed for 15 minutes.' : 'That didn’t save. Try again.')
    return false
  }

  async function remove(c: ReviewComment) {
    const own = Boolean(c.mine)
    if (!(await confirm({ title: 'Delete this comment?', body: own ? 'It goes for everyone, along with any replies. This can’t be undone.' : `${c.author.name}’s comment goes for everyone, along with any replies. This can’t be undone.`, confirmLabel: 'Delete', danger: true }))) return
    const r = await send('DELETE', { id: c._id })
    if (r.ok) {
      setComments((cs) => cs.filter((x) => x._id !== c._id && x.parent !== c._id))
      if (selected === c._id) setSelected(null)
      setSay('Comment deleted.')
    } else setSay(r.error === 'too-late' ? 'Comments can only be deleted for 15 minutes.' : 'That didn’t delete. Try again.')
  }

  /* ── Drawing ──────────────────────────────────────────────────────── */

  const toPoint = (e: React.PointerEvent): [number, number] => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]
  }
  const onDown = (e: React.PointerEvent) => {
    if (!tool || playing) return
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const p = toPoint(e)
    setDrawingNow({ type: tool, color, points: [p, p] })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drawingNow) return
    const p = toPoint(e)
    setDrawingNow((s) => {
      if (!s) return s
      if (s.type === 'pen') {
        const last = s.points[s.points.length - 1]
        return Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004 && s.points.length < 240 ? { ...s, points: [...s.points, p] } : s
      }
      return { ...s, points: [s.points[0], p] }
    })
  }
  const onUp = () => {
    const s = drawingNow
    setDrawingNow(null)
    if (!s) return
    const [a, b] = [s.points[0], s.points[s.points.length - 1]]
    if (s.type !== 'pen' && Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01) return
    if (s.type === 'pen' && s.points.length < 3) return
    setDraft((d) => (d.length >= 12 ? d : [...d, s]))
    setDraftFrame((f) => (f === null ? frame : f))
  }

  /* ── Decision ─────────────────────────────────────────────────────── */

  const [asking, setAsking] = useState(false)
  const [summary, setSummary] = useState('')
  const [decided, setDecided] = useState('')
  async function decide(action: 'approve' | 'changes') {
    if (!project) return
    if (action === 'approve' && !(await confirm({ title: `Approve ${title}, ${versionLabel}?`, body: 'We’ll take it to the next stage.', confirmLabel: 'Approve' }))) return
    const note = action === 'changes' ? summary.trim() || `See the ${openCount} open comment${openCount === 1 ? '' : 's'} in the review room.` : ''
    setBusy(true)
    const r = await fetch('/api/portal/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, key: deliverableKey, action, note }) }).catch(() => null)
    setBusy(false)
    if (r?.ok) {
      setDecided(action === 'approve' ? 'Approved. Thank you! We’ll take it to the next stage.' : 'Sent. We’ll get started on the changes.')
      setAsking(false)
      router.refresh()
    } else setDecided('That didn’t go through. Try again, or reply to our email.')
  }

  /* ── Render ───────────────────────────────────────────────────────── */

  const ranged = inPt !== null && outPt !== null
  const shortcuts = 'Space play or pause · J back 2 s · K pause · L play (again for faster) · ← → one frame · Shift+← → one second · I and O set a range · M comment · Esc clear the range'

  return (
    <div className="rr-host">
      {confirmDialog}
    <div className="rr" ref={root} data-via={via}>
      <div className="rr-main">
        <div className="rr-stage" ref={stage}>
          <div className="rr-picture" onClick={() => !tool && toggle()}>
            {src ? (
              <video
                ref={video}
                src={src}
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  const el = e.currentTarget
                  if (Number.isFinite(el.duration)) setDuration(el.duration)
                  if (el.videoWidth && el.videoHeight) setAspect(el.videoWidth / el.videoHeight)
                  // Start on the middle of the first frame, unless someone already stepped or seeked.
                  if (el.currentTime === 0) el.currentTime = frameMiddle(0, fps)
                }}
                onPlay={() => setPlaying(true)}
                onPause={(e) => {
                  setPlaying(false)
                  // Settle on a whole frame so the timecode and drawings match the picture.
                  const el = e.currentTarget
                  setTime(frameMiddle(frameAt(el.currentTime, fps), fps))
                }}
                onWaiting={() => setBuffering(true)}
                onSeeking={() => setBuffering(true)}
                onCanPlay={() => setBuffering(false)}
                onPlaying={() => setBuffering(false)}
                onSeeked={(e) => {
                  setBuffering(false)
                  setTime(e.currentTarget.currentTime)
                }}
                onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
                onVolumeChange={(e) => {
                  setVolume(e.currentTarget.volume)
                  setMuted(e.currentTarget.muted)
                }}
                onError={() => {
                  // The address runs out after two hours: get a fresh one and carry on from here (once a minute at most).
                  if (Date.now() - retried.current < 60_000) return setLoadError('The video stopped loading. Reload the page to try again.')
                  retried.current = Date.now()
                  const at = video.current?.currentTime ?? 0
                  loadSrc().then(() => {
                    const el = video.current
                    if (el) el.addEventListener('loadedmetadata', () => (el.currentTime = at), { once: true })
                  })
                }}
                aria-label={`${title}, ${versionLabel}`}
              />
            ) : (
              <p className="rr-msg">{loadError || 'Loading the video…'}</p>
            )}
            {src && buffering && (
              <span className="rr-buffer" role="status">
                <span className="rr-spin" aria-hidden="true" />
                Loading…
              </span>
            )}
            {pic.w > 0 && (
              <svg
                className={`rr-draw${tool && !playing ? ' active' : ''}`}
                style={{ left: pic.x, top: pic.y, width: pic.w, height: pic.h }}
                viewBox={`0 0 ${pic.w} ${pic.h}`}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onClick={(e) => tool && e.stopPropagation()}
                aria-hidden={!(showSel || showDraft)}
                role="img"
                aria-label={showSel ? 'Drawing on this frame from the selected comment' : 'Your drawing on this frame'}
              >
                {showSel && sel?.drawing?.map((s, i) => <Shape key={`s${i}`} s={s} w={pic.w} h={pic.h} />)}
                {showDraft && draft.map((s, i) => <Shape key={`d${i}`} s={s} w={pic.w} h={pic.h} />)}
                {drawingNow && <Shape s={drawingNow} w={pic.w} h={pic.h} />}
              </svg>
            )}
          </div>

          <div className="rr-controls">
            <div
              className="rr-timeline"
              ref={bar}
              role="slider"
              tabIndex={0}
              aria-label="Position in the video"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration * 100) / 100}
              aria-valuenow={Math.round(time * 100) / 100}
              aria-valuetext={`${spokenTime(time, fps)} of ${spokenTime(duration, fps).replace(/, frame .*/, '')}`}
              onPointerDown={(e) => {
                scrubbing.current = true
                ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
                pause()
                scrubTo(e.clientX)
              }}
              onPointerMove={(e) => scrubbing.current && scrubTo(e.clientX)}
              onPointerUp={() => (scrubbing.current = false)}
              onKeyDown={(e) => {
                if (e.key === 'Home') seekFrame(0)
                else if (e.key === 'End') seekFrame(frameAt(duration, fps) - 1)
                else if (e.key === 'PageUp' || e.key === 'ArrowUp') step(Math.round(fps) * 10)
                else if (e.key === 'PageDown' || e.key === 'ArrowDown') step(-Math.round(fps) * 10)
                else return
                e.preventDefault()
              }}
            >
              <span className="rr-track" />
              {ranged && <span className="rr-range" style={{ left: pct(inPt!), width: `calc(${pct(outPt!)} - ${pct(inPt!)})` }} />}
              <span className="rr-played" style={{ width: pct(time) }} />
              {tops.map((c) =>
                c.tOut !== undefined ? (
                  <span key={c._id} aria-hidden="true" className={`rr-mark rr-mark-bar${c.done ? ' done' : ''}${c._id === selected ? ' on' : ''}`} style={{ left: pct(c.t), width: `calc(${pct(c.tOut)} - ${pct(c.t)})` }} onPointerDown={(e) => { e.stopPropagation(); goTo(c) }} title={`${c.author.name}: ${c.text.slice(0, 80)}`} />
                ) : (
                  <span key={c._id} aria-hidden="true" className={`rr-mark${c.done ? ' done' : ''}${c._id === selected ? ' on' : ''}`} style={{ left: pct(c.t) }} onPointerDown={(e) => { e.stopPropagation(); goTo(c) }} title={`${c.author.name}: ${c.text.slice(0, 80)}`} />
                ),
              )}
              <span className="rr-head" style={{ left: pct(time) }} />
            </div>

            <div className="rr-buttons">
              <button type="button" className="rr-btn" onClick={() => step(-1)} aria-label="Back one frame" title="Back one frame (←)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zM20 6v12l-9-6z" /></svg>
              </button>
              <button type="button" className="rr-btn rr-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
                {playing ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <button type="button" className="rr-btn" onClick={() => step(1)} aria-label="Forward one frame" title="Forward one frame (→)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 6h2v12h-2zM4 6v12l9-6z" /></svg>
              </button>
              <button type="button" className="rr-tc" onClick={() => setSmpte((s) => !s)} aria-label={`${smpte ? 'Timecode' : 'Time'} ${smpte ? timecode(frame, fps) : clockTime(time)}. Switch to ${smpte ? 'plain time' : 'timecode'}`} title={smpte ? 'Timecode (click for plain time)' : 'Plain time (click for timecode)'}>
                <span className="rr-tc-now">{smpte ? timecode(frame, fps) : clockTime(time)}</span>
                <span className="rr-tc-of"> / {smpte ? timecode(Math.max(0, frameAt(duration, fps) - 1), fps) : clockTime(duration)}</span>
              </button>
              <span className="rr-spacer" />
              <button type="button" className="rr-btn rr-text-btn" onClick={setIn} title="Set in point (I)">In</button>
              <button type="button" className="rr-btn rr-text-btn" onClick={setOut} title="Set out point (O)">Out</button>
              <button type="button" className="rr-btn rr-text-btn" aria-pressed={loop} disabled={!ranged} onClick={() => setLoop((l) => !l)} title="Loop the range">Loop</button>
              <label className="rr-speed">
                <span className="sr-only">Speed</span>
                <select value={rate} onChange={(e) => { const r = Number(e.target.value); if (video.current) video.current.playbackRate = r; setRate(r) }}>
                  {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
                </select>
              </label>
              <button type="button" className="rr-btn" onClick={() => { if (video.current) video.current.muted = !video.current.muted }} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}>
                {muted || volume === 0 ? <svg className="rr-stroke" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6" /></svg> : <svg className="rr-stroke" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /></svg>}
              </button>
              <input className="rr-volume" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume" onChange={(e) => { const el = video.current; if (!el) return; el.volume = Number(e.target.value); el.muted = Number(e.target.value) === 0 }} />
              <button type="button" className="rr-btn" onClick={fullscreen} aria-label="Full screen" title="Full screen (F)">
                <svg className="rr-stroke" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
              </button>
            </div>
          </div>
        </div>

        {canWrite && (
          <form
            className="rr-compose"
            onSubmit={(e) => {
              e.preventDefault()
              post()
            }}
          >
            <div className="rr-compose-head">
              <label htmlFor={`rr-box-${deliverableKey}`} className="rr-compose-label">{label}</label>
              {ranged && <button type="button" className="linklike small" onClick={clearRange}>Clear range</button>}
            </div>
            {!playing && (
              <div className="rr-tools" role="toolbar" aria-label="Draw on this frame">
                {(['arrow', 'box', 'pen'] as const).map((t) => (
                  <button key={t} type="button" className="rr-tool" aria-pressed={tool === t} onClick={() => setTool((x) => (x === t ? null : t))}>
                    <ToolIcon t={t} />
                    <span>{t === 'arrow' ? 'Arrow' : t === 'box' ? 'Box' : 'Pen'}</span>
                  </button>
                ))}
                <span className="rr-swatches" role="radiogroup" aria-label="Colour">
                  {COLORS.map((c) => (
                    <button key={c.value} type="button" role="radio" aria-checked={color === c.value} aria-label={c.name} title={c.name} className="rr-swatch" style={{ ['--sw' as string]: c.value }} onClick={() => setColor(c.value)} />
                  ))}
                </span>
                <button type="button" className="rr-tool" disabled={!draft.length} onClick={() => setDraft((d) => { const n = d.slice(0, -1); if (!n.length) setDraftFrame(null); return n })}>Undo</button>
                <button type="button" className="rr-tool" disabled={!draft.length} onClick={() => { setDraft([]); setDraftFrame(null) }}>Clear</button>
              </div>
            )}
            <textarea
              id={`rr-box-${deliverableKey}`}
              ref={box}
              className="input rr-box"
              rows={2}
              maxLength={2000}
              value={text}
              placeholder={tool ? 'Draw on the picture, then describe it…' : 'What should change here?'}
              onChange={(e) => {
                if (!text && e.target.value) pause()
                setText(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  post()
                } else if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur()
              }}
              aria-describedby={`rr-hint-${deliverableKey}`}
            />
            <div className="rr-compose-foot">
              <span id={`rr-hint-${deliverableKey}`} className="small muted">Enter posts · Shift+Enter for a new line{draft.length ? ` · ${draft.length} drawing${draft.length === 1 ? '' : 's'} attached` : ''}</span>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Post'}</button>
            </div>
          </form>
        )}
        {props.readOnly && <p className="small muted rr-readonly">You’re watching only, so commenting is switched off here.</p>}
        <details className="rr-keys small muted">
          <summary>Keyboard shortcuts</summary>
          <p>{shortcuts}. Shortcuts pause while you type.</p>
        </details>
      </div>

      <aside className="rr-side" aria-label="Comments">
        {props.canDecide && props.status === 'awaiting-feedback' && !decided && (
          <section className="rr-decide" aria-label="Your decision on this version">
            {!asking ? (
              <div className="rr-decide-row">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide('approve')}>Approve this version</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setAsking(true)}>Request changes</button>
              </div>
            ) : (
              <div className="stack rr-ask">
                <p className="small"><strong>{openCount}</strong> open comment{openCount === 1 ? '' : 's'} will go with this request.</p>
                <label htmlFor={`rr-sum-${deliverableKey}`} className="small muted">Anything else? (optional)</label>
                <textarea id={`rr-sum-${deliverableKey}`} className="input" rows={3} maxLength={4000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A summary, or anything that isn’t about one moment" />
                <div className="rr-decide-row">
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy || (!openCount && !summary.trim())} onClick={() => decide('changes')}>{busy ? 'Sending…' : 'Send the request'}</button>
                  <button type="button" className="linklike small" onClick={() => setAsking(false)}>Cancel</button>
                </div>
                {!openCount && !summary.trim() && <p className="small muted">Add a comment on the video or a note here first.</p>}
              </div>
            )}
          </section>
        )}
        {decided && <p className="small rr-decided" role="status">{decided}</p>}
        {!props.canDecide && <p className="small muted rr-status"><span className={`pill pill-${props.status}`}>{STATUS_WORD[props.status]}</span></p>}
        {props.note && <p className="deliv-note">{props.note}</p>}

        <div className="rr-side-head">
          <h2 className="rr-h">Comments <span className="muted">{tops.length ? `(${openCount} open)` : ''}</span></h2>
          <div className="rr-filter" role="group" aria-label="Show">
            {(['all', 'open', 'done'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Done'}</button>
            ))}
          </div>
        </div>
        {sample && <p className="small muted rr-sample">Sample: comments you add stay in this tab only.</p>}
        {!loaded ? (
          <p className="small muted">Loading comments…</p>
        ) : shown.length ? (
          <ol className="rr-list">
            {shown.map((c) => (
              <CommentItem
                key={c._id}
                c={c}
                fps={fps}
                smpte={smpte}
                replies={repliesOf(c._id)}
                selected={c._id === selected}
                canWrite={canWrite}
                canDone={canWrite && (via !== 'share' || Boolean(c.mine))}
                isAdmin={via === 'admin'}
                onGo={() => goTo(c)}
                onDone={(d) => markDone(c, d)}
                onReply={(b) => reply(c, b)}
                onEdit={edit}
                onDelete={remove}
              />
            ))}
          </ol>
        ) : (
          <p className="small muted">{tops.length ? 'Nothing here with this filter.' : canWrite ? 'No comments yet. Pause anywhere and type a note: it’s pinned to that exact frame.' : 'No comments yet.'}</p>
        )}
      </aside>
      <p className="sr-only" role="status" aria-live="polite">{say}</p>
    </div>
    </div>
  )
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

function Shape({ s, w, h }: { s: ReviewShape; w: number; h: number }) {
  const pts = s.points.map(([x, y]) => [x * w, y * h] as const)
  const stroke = { stroke: s.color, strokeWidth: 3, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (s.type === 'box') {
    const [a, b] = [pts[0], pts[pts.length - 1]]
    return <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} {...stroke} />
  }
  if (s.type === 'arrow') {
    const [a, b] = [pts[0], pts[pts.length - 1]]
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
    const L = 16
    const h1 = [b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45)]
    const h2 = [b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)]
    return (
      <g {...stroke}>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
        <polyline points={`${h1[0]},${h1[1]} ${b[0]},${b[1]} ${h2[0]},${h2[1]}`} />
      </g>
    )
  }
  return <polyline points={pts.map((p) => p.join(',')).join(' ')} {...stroke} />
}

function ToolIcon({ t }: { t: 'arrow' | 'box' | 'pen' }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {t === 'arrow' ? <path d="M5 19L19 5M10 5h9v9" /> : t === 'box' ? <rect x="4" y="6" width="16" height="12" rx="1" /> : <path d="M4 18c3-1 4-6 7-6s2 5 5 5 3-4 4-6" />}
    </svg>
  )
}

const when = (iso: string) => {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

/** `avatar`: the owner's side shows the author's initials in a circle (decorative; the name follows). */
function Who({ c, avatar }: { c: ReviewComment; avatar?: boolean }) {
  return (
    <span className="rr-who">
      {avatar && <Initials name={c.author.name} />}
      <strong>{c.author.name}</strong>
      {c.author.kind === 'guest' && <span className="rr-tag">Guest</span>}
      {c.author.kind === 'admin' && <span className="rr-tag rr-tag-us">Breaking Ice</span>}
      {c.mine && <span className="sr-only"> (you)</span>}
    </span>
  )
}

function CommentItem({
  c,
  fps,
  smpte,
  replies,
  selected,
  canWrite,
  canDone,
  isAdmin,
  onGo,
  onDone,
  onReply,
  onEdit,
  onDelete,
}: {
  c: ReviewComment
  fps: number
  smpte: boolean
  replies: ReviewComment[]
  selected: boolean
  canWrite: boolean
  canDone: boolean
  isAdmin: boolean
  onGo: () => void
  onDone: (done: boolean) => void
  onReply: (text: string) => Promise<boolean>
  onEdit: (c: ReviewComment, text: string) => Promise<boolean>
  onDelete: (c: ReviewComment) => void
}) {
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const at = (t: number) => (smpte ? timecode(frameOf(t, fps), fps) : clockTime(t))
  const chip = c.tOut !== undefined ? `${at(c.t)} – ${at(c.tOut)}` : at(c.t)
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  // Posted a moment ago and still on its way to the server.
  const pending = c._id.startsWith('pending-')

  return (
    <li ref={ref} className={`rr-item${c.done ? ' done' : ''}${selected ? ' on' : ''}${pending ? ' is-pending' : ''}`} aria-current={selected ? 'true' : undefined} aria-busy={pending || undefined}>
      <div className="rr-item-head">
        <button type="button" className="rr-chip" onClick={onGo} aria-label={`Go to ${chip}${c.drawing?.length ? ', with a drawing' : ''}`}>
          {chip}
          {c.drawing?.length ? <ToolIcon t="pen" /> : null}
        </button>
        <Who c={c} avatar={isAdmin} />
        <span className="small muted rr-when">{pending ? 'Posting…' : when(c.createdAt)}{c.editedAt ? ' · edited' : ''}</span>
      </div>
      <Body c={c} isAdmin={isAdmin} canWrite={canWrite && !pending} onEdit={onEdit} onDelete={onDelete} deleteBelow />
      {c.done && <p className="small rr-done-note"><span aria-hidden="true">✓ </span>Done{c.doneBy ? ` · ${c.doneBy}` : ''}</p>}

      {replies.length > 0 && (
        <ol className="rr-replies" aria-label="Replies">
          {replies.map((r) => (
            <li key={r._id} className="rr-reply">
              <div className="rr-item-head">
                <Who c={r} avatar={isAdmin} />
                <span className="small muted rr-when">{when(r.createdAt)}{r.editedAt ? ' · edited' : ''}</span>
              </div>
              <Body c={r} isAdmin={isAdmin} canWrite={canWrite} onEdit={onEdit} onDelete={onDelete} />
            </li>
          ))}
        </ol>
      )}

      {canWrite && !pending && (
        <div className="rr-item-actions">
          <button type="button" className="linklike small" onClick={() => setReplying((r) => !r)} aria-expanded={replying}>Reply</button>
          {canDone && (
            <label className="small rr-done-toggle">
              <input type="checkbox" checked={Boolean(c.done)} onChange={(e) => onDone(e.target.checked)} /> Done
            </label>
          )}
          {canDeleteIt(c, canWrite, isAdmin) && <button type="button" className="linklike small rr-delete" onClick={() => onDelete(c)}>Delete<span className="sr-only"> comment by {c.author.name}</span></button>}
        </div>
      )}
      {replying && (
        <form
          className="rr-reply-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (draft.trim() && (await onReply(draft.trim()))) {
              setDraft('')
              setReplying(false)
            }
          }}
        >
          <label className="sr-only" htmlFor={`rp-${c._id}`}>Reply to {c.author.name}</label>
          <textarea
            id={`rp-${c._id}`}
            className="input"
            rows={2}
            maxLength={2000}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <div className="rr-decide-row">
            <button type="submit" className="btn btn-secondary btn-sm" disabled={!draft.trim()}>Reply</button>
            <button type="button" className="linklike small" onClick={() => setReplying(false)}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  )
}

/** Your own comment for 15 minutes; in the back office, anyone's. */
const canDeleteIt = (c: ReviewComment, canWrite: boolean, isAdmin: boolean) => canWrite && ((Boolean(c.mine) && Date.now() - Date.parse(c.createdAt) < EDIT_MS) || isAdmin)

/** The text, with Edit (and Delete, for replies; a top comment's Delete sits last in its action row). */
function Body({ c, isAdmin, canWrite, onEdit, onDelete, deleteBelow }: { c: ReviewComment; isAdmin: boolean; canWrite: boolean; onEdit: (c: ReviewComment, text: string) => Promise<boolean>; onDelete: (c: ReviewComment) => void; deleteBelow?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(c.text)
  const fresh = Date.now() - Date.parse(c.createdAt) < EDIT_MS
  const canEdit = canWrite && Boolean(c.mine) && fresh
  const canDelete = !deleteBelow && canDeleteIt(c, canWrite, isAdmin)
  if (editing)
    return (
      <form
        className="rr-reply-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (val.trim() && (await onEdit(c, val.trim()))) setEditing(false)
        }}
      >
        <label className="sr-only" htmlFor={`ed-${c._id}`}>Edit your comment</label>
        <textarea id={`ed-${c._id}`} className="input" rows={2} maxLength={2000} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
        <div className="rr-decide-row">
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!val.trim()}>Save</button>
          <button type="button" className="linklike small" onClick={() => { setVal(c.text); setEditing(false) }}>Cancel</button>
        </div>
      </form>
    )
  return (
    <>
      <p className="rr-text">{c.text}</p>
      {(canEdit || canDelete) && (
        <div className="rr-own">
          {canEdit && <button type="button" className="linklike small" onClick={() => setEditing(true)}>Edit<span className="sr-only"> your comment</span></button>}
          {canDelete && <button type="button" className="linklike small rr-delete" onClick={() => onDelete(c)}>Delete<span className="sr-only"> comment by {c.author.name}</span></button>}
        </div>
      )}
    </>
  )
}
