'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clockTime, frameAt, frameMiddle, frameOf, frameStart, spokenTime, timecode } from './timecode'
import type { DeliverableStatus, ReviewComment, ReviewShape } from './types'
import { useConfirmDialog } from '@/admin/ui/confirm'
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
  /** The breadcrumb before the title in the top bar, e.g. [client, project]. */
  crumbs?: string[]
  /** Where the back chevron goes; no chevron without it. */
  backHref?: string
  /** Every version of this deliverable the viewer can open, oldest first, for the stepper. */
  versions?: RoomVersion[]
  /** For versions without an href: called with the key of the version to open. */
  onVersion?: (key: string) => void
}

export type RoomVersion = { key: string; label: string; href?: string }

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
type Fmt = 'tc' | 'frames' | 'clock'
type Sort = 'time' | 'newest'
const FILTER_WORD: Record<Filter, string> = { all: 'All comments', open: 'Open', done: 'Resolved' }
const FMT_WORD: Record<Fmt, string> = { tc: 'Timecode', frames: 'Frames', clock: 'Minutes and seconds' }

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
  const [poster, setPoster] = useState<string>()
  const [loadError, setLoadError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(props.duration ?? 0)
  const [buffering, setBuffering] = useState(true)
  const [rate, setRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fmt, setFmt] = useState<Fmt>('tc')
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
  const [tab, setTab] = useState<'comments' | 'details'>('comments')
  const [sort, setSort] = useState<Sort>('time')
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')

  const frame = frameAt(time, fps)
  /** A stored time in the chosen format (timecode, frame number or plain time). */
  const show = useCallback((t: number) => (fmt === 'tc' ? timecode(frameOf(t, fps), fps) : fmt === 'frames' ? String(frameOf(t, fps)) : clockTime(t)), [fmt, fps])
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
    const j = (await r?.json().catch(() => null)) as { url?: string; poster?: string; error?: string } | null
    if (r?.ok && j?.url) {
      setSrc(j.url)
      if (j.poster) setPoster(j.poster)
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
  // With no range set, Loop repeats the whole video.
  useEffect(() => {
    if (video.current) video.current.loop = loop && (inPt === null || outPt === null)
  }, [loop, inPt, outPt, src])

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
  // #1, #2…: by when each top comment was written on this version, so a number never moves when you sort or filter.
  const numbers = useMemo(() => new Map([...tops].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((c, i) => [c._id, i + 1])), [tops])
  const needle = search.trim().toLowerCase()
  const matches = (c: ReviewComment) => !needle || [c, ...repliesOf(c._id)].some((x) => x.text.toLowerCase().includes(needle) || x.author.name.toLowerCase().includes(needle))
  const shown = tops
    .filter((c) => (filter === 'open' ? !c.done : filter === 'done' ? c.done : true))
    .filter(matches)
    .sort((a, b) => (sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : 0))
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
  const pickTool = (t: 'arrow' | 'box' | 'pen') => {
    pause()
    setTool((x) => (x === t ? null : t))
  }
  const readout = fmt === 'tc' ? timecode(frame, fps) : fmt === 'frames' ? String(frame) : clockTime(time)
  const total = fmt === 'tc' ? timecode(Math.max(0, frameAt(duration, fps) - 1), fps) : fmt === 'frames' ? String(Math.max(0, frameAt(duration, fps) - 1)) : clockTime(duration)
  const pointChip = ranged ? `${show(inPt!)} – ${show(outPt!)}` : show(inPt !== null ? inPt : frameStart(atFrame, fps))
  const versions = props.versions ?? []
  const vAt = versions.findIndex((x) => x.key === deliverableKey)
  const crumbs = (props.crumbs ?? []).filter(Boolean)

  const tabKeys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.stopPropagation()
    const next = tab === 'comments' ? 'details' : 'comments'
    setTab(next)
    document.getElementById(`rr-tab-${next}-${deliverableKey}`)?.focus()
  }

  return (
    <div className="rr-host">
      {confirmDialog}
      <div className="rr" ref={root} data-via={via}>
        {/* ── Top bar: back, breadcrumb, version stepper ── */}
        <header className="rr-top">
          {props.backHref && (
            <Link className="rr-icon rr-back" href={props.backHref} aria-label="Back" title="Back">
              <Icon d="M15 5l-7 7 7 7" />
            </Link>
          )}
          <nav className="rr-crumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
              <li aria-current="page">{title}</li>
            </ol>
          </nav>
          {versions.length > 1 && vAt >= 0 ? (
            <nav className="rr-stepper" aria-label="Versions">
              <StepTo v={versions[vAt - 1]} dir="prev" onVersion={props.onVersion} />
              <span className="rr-stepper-now" title={versionLabel}>
                <span aria-hidden="true">{vAt + 1} of {versions.length}</span>
                <span className="sr-only">{versionLabel}, {vAt + 1} of {versions.length}</span>
              </span>
              <StepTo v={versions[vAt + 1]} dir="next" onVersion={props.onVersion} />
            </nav>
          ) : (
            <span className="rr-stepper rr-stepper-one">{versionLabel}</span>
          )}
        </header>

        <div className="rr-body">
          {/* ── Player ── */}
          <div className="rr-main">
            <div className="rr-stage" ref={stage}>
              <div className={`rr-picture${tool ? ' drawing' : ''}`} onClick={() => !tool && toggle()}>
                {src ? (
                  <video
                    ref={video}
                    src={src}
                    poster={poster}
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
                {src && !playing && !tool && !buffering && (
                  <span className="rr-bigplay" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M8.5 5.5v13l10.5-6.5z" /></svg>
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
                  {tops.map((c) => c.tOut !== undefined && <span key={c._id} aria-hidden="true" className={`rr-mark-bar${c.done ? ' done' : ''}${c._id === selected ? ' on' : ''}`} style={{ left: pct(c.t), width: `calc(${pct(c.tOut)} - ${pct(c.t)})` }} />)}
                  <span className="rr-head" style={{ left: pct(time) }} />
                </div>

                {/* One small avatar per comment, sitting at its time; the comment list is the keyboard route to the same place. */}
                {tops.length > 0 && (
                  <div className="rr-markers" aria-hidden="true">
                    {tops.map((c) => (
                      <span
                        key={c._id}
                        className={`rr-marker${c.done ? ' done' : ''}${c._id === selected ? ' on' : ''}`}
                        style={{ left: pct(c.t), ['--av' as string]: avColor(c) }}
                        title={`#${numbers.get(c._id) ?? ''} ${c.author.name}: ${c.text.slice(0, 80)}`}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          setTab('comments')
                          goTo(c)
                        }}
                      >
                        {initial(c.author.name)}
                      </span>
                    ))}
                  </div>
                )}

                <div className="rr-transport">
                  <div className="rr-transport-l">
                    <button type="button" className="rr-icon rr-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
                      {playing ? <svg viewBox="0 0 24 24" aria-hidden="true" className="rr-fill"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true" className="rr-fill"><path d="M8 5v14l11-7z" /></svg>}
                    </button>
                    <button type="button" className="rr-icon rr-wide" onClick={() => step(-1)} aria-label="Back one frame" title="Back one frame (←)">
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="rr-fill"><path d="M6 6h2v12H6zM19 6v12l-9-6z" /></svg>
                    </button>
                    <button type="button" className="rr-icon rr-wide" onClick={() => step(1)} aria-label="Forward one frame" title="Forward one frame (→)">
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="rr-fill"><path d="M16 6h2v12h-2zM5 6v12l9-6z" /></svg>
                    </button>
                    <button type="button" className="rr-icon" aria-pressed={loop} onClick={() => setLoop((l) => !l)} aria-label={ranged ? 'Loop the range' : 'Loop'} title={ranged ? 'Loop the in–out range' : 'Loop the video'}>
                      <Icon d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />
                    </button>
                    <Pop
                      label={`Speed ${rate}×`}
                      btnClass="rr-text-btn"
                      button={`${rate.toFixed(1)}x`}
                      up
                    >
                      {(close) => (
                        <Choices
                          label="Speed"
                          items={SPEEDS.map((s) => ({ value: s, label: `${s.toFixed(1)}x` }))}
                          value={rate}
                          close={close}
                          onPick={(r) => {
                            if (video.current) video.current.playbackRate = r
                            setRate(r)
                          }}
                        />
                      )}
                    </Pop>
                    <span className="rr-vol">
                      <button type="button" className="rr-icon" onClick={() => { if (video.current) video.current.muted = !video.current.muted }} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}>
                        {muted || volume === 0 ? <Icon d="M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6" /> : <Icon d="M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
                      </button>
                      <input className="rr-volume" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume" onChange={(e) => { const el = video.current; if (!el) return; el.volume = Number(e.target.value); el.muted = Number(e.target.value) === 0 }} />
                    </span>
                  </div>

                  <div className="rr-transport-c">
                    <Pop
                      label={`${FMT_WORD[fmt]} ${readout} of ${total}. Change the time format`}
                      btnClass="rr-tc"
                      button={
                        <>
                          <span className="rr-tc-now">{readout}</span>
                          <Icon d="M7 10l5 5 5-5" />
                        </>
                      }
                      align="center"
                      up
                    >
                      {(close) => <Choices label="Time format" items={(['tc', 'frames', 'clock'] as const).map((f) => ({ value: f, label: FMT_WORD[f] }))} value={fmt} onPick={setFmt} close={close} />}
                    </Pop>
                  </div>

                  <div className="rr-transport-r">
                    <Pop label="Keyboard shortcuts" btnClass="rr-icon" button={<Icon d="M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8" />} align="end" up>
                      {() => (
                        <div className="rr-keys" tabIndex={-1} data-autofocus>
                          <p className="rr-pop-h">Keyboard shortcuts</p>
                          <dl>
                            {SHORTCUTS.map(([k, what]) => (
                              <div key={k}><dt><kbd>{k}</kbd></dt><dd>{what}</dd></div>
                            ))}
                          </dl>
                          <p className="rr-muted">Shortcuts pause while you type.</p>
                        </div>
                      )}
                    </Pop>
                    <button type="button" className="rr-icon" onClick={fullscreen} aria-label="Full screen" title="Full screen (F)">
                      <Icon d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Side panel ── */}
          <aside className="rr-side" aria-label="Comments and details">
            <div className="rr-side-in">
              <div className="rr-tabs" role="tablist" aria-label="Review room" onKeyDown={tabKeys}>
                {(['comments', 'details'] as const).map((t) => (
                  <button
                    key={t}
                    id={`rr-tab-${t}-${deliverableKey}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    aria-controls={`rr-panel-${t}-${deliverableKey}`}
                    tabIndex={tab === t ? 0 : -1}
                    onClick={() => setTab(t)}
                  >
                    {t === 'comments' ? <>Comments{openCount ? <span className="rr-count">{openCount}</span> : null}</> : 'Details'}
                  </button>
                ))}
              </div>

              <div className="rr-panel rr-panel-comments" role="tabpanel" id={`rr-panel-comments-${deliverableKey}`} aria-labelledby={`rr-tab-comments-${deliverableKey}`} hidden={tab !== 'comments'}>
                {props.canDecide && props.status === 'awaiting-feedback' && !decided && (
                  <section className="rr-decide" aria-label="Your decision on this version">
                    {!asking ? (
                      <div className="rr-decide-row">
                        <button type="button" className="rr-cta rr-cta-primary" disabled={busy} onClick={() => decide('approve')}>Approve this version</button>
                        <button type="button" className="rr-cta" disabled={busy} onClick={() => setAsking(true)}>Request changes</button>
                      </div>
                    ) : (
                      <div className="rr-ask">
                        <p><strong>{openCount}</strong> open comment{openCount === 1 ? '' : 's'} will go with this request.</p>
                        <label htmlFor={`rr-sum-${deliverableKey}`} className="rr-muted">Anything else? (optional)</label>
                        <textarea id={`rr-sum-${deliverableKey}`} className="rr-input" rows={3} maxLength={4000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A summary, or anything that isn’t about one moment" />
                        <div className="rr-decide-row">
                          <button type="button" className="rr-cta rr-cta-primary" disabled={busy || (!openCount && !summary.trim())} onClick={() => decide('changes')}>{busy ? 'Sending…' : 'Send the request'}</button>
                          <button type="button" className="rr-link" onClick={() => setAsking(false)}>Cancel</button>
                        </div>
                        {!openCount && !summary.trim() && <p className="rr-muted">Add a comment on the video or a note here first.</p>}
                      </div>
                    )}
                  </section>
                )}
                {decided && <p className="rr-decided" role="status">{decided}</p>}

                <div className="rr-bar">
                  <Pop label={`Show: ${FILTER_WORD[filter]}`} btnClass="rr-filter-btn" button={<>{FILTER_WORD[filter]}<Icon d="M7 10l5 5 5-5" /></>}>
                    {(close) => (
                      <Choices
                        label="Show"
                        items={(['all', 'open', 'done'] as const).map((f) => ({ value: f, label: `${FILTER_WORD[f]} (${f === 'all' ? tops.length : f === 'open' ? openCount : tops.length - openCount})` }))}
                        value={filter}
                        onPick={setFilter}
                        close={close}
                      />
                    )}
                  </Pop>
                  <span className="rr-bar-icons">
                    <Pop label={`Sort: ${sort === 'time' ? 'by time in the video' : 'newest first'}`} btnClass="rr-icon rr-icon-sm" button={<Icon d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3" />} align="end">
                      {(close) => <Choices label="Sort" items={[{ value: 'time' as Sort, label: 'By time in the video' }, { value: 'newest' as Sort, label: 'Newest first' }]} value={sort} onPick={setSort} close={close} />}
                    </Pop>
                    <button
                      type="button"
                      className="rr-icon rr-icon-sm"
                      aria-pressed={searching}
                      aria-label="Search comments"
                      title="Search comments"
                      onClick={() => {
                        setSearching((s) => !s)
                        if (searching) setSearch('')
                      }}
                    >
                      <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
                    </button>
                  </span>
                </div>
                {searching && (
                  <div className="rr-search">
                    <label className="sr-only" htmlFor={`rr-q-${deliverableKey}`}>Search comments</label>
                    <input
                      id={`rr-q-${deliverableKey}`}
                      className="rr-input"
                      type="search"
                      autoFocus
                      value={search}
                      placeholder="Search comments and names"
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          setSearch('')
                          setSearching(false)
                        }
                      }}
                    />
                  </div>
                )}

                <div className="rr-scroll">
                  {sample && <p className="rr-muted rr-sample">Sample: comments you add stay in this tab only.</p>}
                  {props.note && (
                    <div className="rr-note">
                      <p className="rr-note-h">Note from Breaking Ice</p>
                      <p>{props.note}</p>
                    </div>
                  )}
                  {!loaded ? (
                    <p className="rr-muted rr-empty">Loading comments…</p>
                  ) : shown.length ? (
                    <ol className="rr-list">
                      {shown.map((c) => (
                        <CommentItem
                          key={c._id}
                          c={c}
                          num={numbers.get(c._id)}
                          show={show}
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
                    <p className="rr-muted rr-empty">{tops.length ? (needle ? 'No comments match that search.' : 'Nothing here with this filter.') : canWrite ? 'No comments yet. Pause anywhere and type a note: it’s pinned to that exact frame.' : 'No comments yet.'}</p>
                  )}
                </div>

                {canWrite && (
                  <form
                    className="rr-compose"
                    onSubmit={(e) => {
                      e.preventDefault()
                      post()
                    }}
                  >
                    <div className="rr-compose-box">
                      <div className="rr-compose-top">
                        <span className="rr-chip rr-chip-static" aria-hidden="true">{pointChip}</span>
                        {ranged && (
                          <button type="button" className="rr-chip-x" onClick={clearRange} aria-label="Clear the range" title="Clear the range (Esc)">
                            <Icon d="M6 6l12 12M18 6L6 18" />
                          </button>
                        )}
                        {draft.length > 0 && <span className="rr-muted rr-attached">{draft.length} drawing{draft.length === 1 ? '' : 's'}</span>}
                      </div>
                      <label htmlFor={`rr-box-${deliverableKey}`} className="sr-only">{label}</label>
                      <textarea
                        id={`rr-box-${deliverableKey}`}
                        ref={box}
                        className="rr-box"
                        rows={2}
                        maxLength={2000}
                        value={text}
                        placeholder={tool ? 'Draw on the picture, then describe it…' : 'Leave your comment…'}
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
                      <span id={`rr-hint-${deliverableKey}`} className="sr-only">Enter posts. Shift+Enter for a new line.{draft.length ? ` ${draft.length} drawing${draft.length === 1 ? '' : 's'} attached.` : ''}</span>
                      <div className="rr-compose-bar">
                        <div className="rr-tools" role="toolbar" aria-label="Draw on this frame and set a range">
                          {(['arrow', 'box', 'pen'] as const).map((t) => (
                            <button key={t} type="button" className="rr-icon rr-icon-sm" aria-pressed={tool === t} onClick={() => pickTool(t)} aria-label={t === 'arrow' ? 'Arrow' : t === 'box' ? 'Box' : 'Pen'} title={`Draw: ${t === 'arrow' ? 'arrow' : t === 'box' ? 'box' : 'pen'}`}>
                              <ToolIcon t={t} />
                            </button>
                          ))}
                          <Pop label={`Colour: ${COLORS.find((c) => c.value === color)?.name ?? ''}`} btnClass="rr-icon rr-icon-sm" button={<span className="rr-dot" style={{ ['--sw' as string]: color }} />} up>
                            {(close) => (
                              <div className="rr-swatches" role="radiogroup" aria-label="Colour">
                                {COLORS.map((c) => (
                                  <button key={c.value} type="button" role="radio" aria-checked={color === c.value} aria-label={c.name} title={c.name} className="rr-swatch" style={{ ['--sw' as string]: c.value }} data-autofocus={color === c.value || undefined} onClick={() => { setColor(c.value); close() }} />
                                ))}
                              </div>
                            )}
                          </Pop>
                          {draft.length > 0 && (
                            <>
                              <button type="button" className="rr-icon rr-icon-sm" onClick={() => setDraft((d) => { const n = d.slice(0, -1); if (!n.length) setDraftFrame(null); return n })} aria-label="Undo the last drawing" title="Undo">
                                <Icon d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
                              </button>
                              <button type="button" className="rr-icon rr-icon-sm" onClick={() => { setDraft([]); setDraftFrame(null) }} aria-label="Clear the drawings" title="Clear drawings">
                                <Icon d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                              </button>
                            </>
                          )}
                          <span className="rr-inout">
                            <span className="rr-sep" aria-hidden="true" />
                            <button type="button" className="rr-text-btn rr-text-btn-sm" aria-pressed={inPt !== null} onClick={setIn} title="Set in point (I)" aria-label="Set in point">In</button>
                            <button type="button" className="rr-text-btn rr-text-btn-sm" aria-pressed={outPt !== null} onClick={setOut} title="Set out point (O)" aria-label="Set out point">Out</button>
                          </span>
                        </div>
                        <button type="submit" className="rr-send" disabled={busy || !text.trim()} aria-label={busy ? 'Posting' : 'Post comment'} title="Post (Enter)">
                          {busy ? <span className="rr-spin" aria-hidden="true" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
                {props.readOnly && <p className="rr-muted rr-readonly">You’re watching only, so commenting is switched off here.</p>}
              </div>

              <div className="rr-panel rr-panel-details" role="tabpanel" id={`rr-panel-details-${deliverableKey}`} aria-labelledby={`rr-tab-details-${deliverableKey}`} hidden={tab !== 'details'}>
                <dl className="rr-details">
                  <div><dt>Title</dt><dd>{title}</dd></div>
                  <div><dt>Version</dt><dd>{versionLabel}{versions.length > 1 && vAt >= 0 ? ` (${vAt + 1} of ${versions.length})` : ''}</dd></div>
                  <div><dt>Status</dt><dd><span className="rr-pill" data-status={props.status}>{STATUS_WORD[props.status]}</span></dd></div>
                  {duration > 0 && <div><dt>Length</dt><dd>{timecode(Math.max(0, frameAt(duration, fps) - 1), fps)} <span className="rr-muted">({clockTime(duration)})</span></dd></div>}
                  <div><dt>Frame rate</dt><dd>{fps} fps</dd></div>
                  <div><dt>Comments</dt><dd>{tops.length} ({openCount} open)</dd></div>
                </dl>
                {props.note && (
                  <div className="rr-note">
                    <p className="rr-note-h">Note from Breaking Ice</p>
                    <p>{props.note}</p>
                  </div>
                )}
                <div className="rr-keys">
                  <p className="rr-pop-h">Keyboard shortcuts</p>
                  <dl>
                    {SHORTCUTS.map(([k, what]) => (
                      <div key={k}><dt><kbd>{k}</kbd></dt><dd>{what}</dd></div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </aside>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{say}</p>
      </div>
    </div>
  )
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause'],
  ['J', 'Back 2 seconds'],
  ['K', 'Pause'],
  ['L', 'Play (again for faster)'],
  ['← →', 'One frame'],
  ['Shift ← →', 'One second'],
  ['I / O', 'Set in and out points'],
  ['M', 'Write a comment'],
  ['F', 'Full screen'],
  ['Esc', 'Clear the range'],
]

/** A stroke icon on a 24-unit grid. */
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="rr-stroke">
      <path d={d} />
    </svg>
  )
}

/** ‹ or › in the version stepper: a link when the version has an address, a button otherwise, disabled at the ends. */
function StepTo({ v, dir, onVersion }: { v?: RoomVersion; dir: 'prev' | 'next'; onVersion?: (key: string) => void }) {
  const icon = <Icon d={dir === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  const label = v ? `${dir === 'prev' ? 'Previous' : 'Next'} version: ${v.label}` : dir === 'prev' ? 'No earlier version' : 'No later version'
  if (v?.href)
    return (
      <Link className="rr-step" href={v.href} aria-label={label} title={label}>
        {icon}
      </Link>
    )
  return (
    <button type="button" className="rr-step" disabled={!v || !onVersion} aria-label={label} title={label} onClick={() => v && onVersion?.(v.key)}>
      {icon}
    </button>
  )
}

/** A small button with a menu or panel that opens beside it; Escape or a click elsewhere closes it. */
function Pop({ label, btnClass, button, children, align = 'start', up = false }: { label: string; btnClass: string; button: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'start' | 'center' | 'end'; up?: boolean }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    const first = wrap.current?.querySelector<HTMLElement>('[aria-checked="true"], [data-autofocus], [role="menuitemradio"]')
    first?.focus()
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  const close = () => {
    setOpen(false)
    btn.current?.focus()
  }
  return (
    <span
      className="rr-pop"
      ref={wrap}
      onKeyDown={(e) => {
        if (!open) return
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          close()
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="radio"]') ?? [])]
          if (!items.length) return
          e.preventDefault()
          e.stopPropagation()
          const i = items.indexOf(document.activeElement as HTMLElement)
          items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus()
        }
      }}
    >
      <button ref={btn} type="button" className={btnClass} aria-haspopup="true" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((o) => !o)}>
        {button}
      </button>
      {open && <div className={`rr-pop-panel rr-pop-${align}${up ? ' rr-pop-up' : ''}`}>{children(close)}</div>}
    </span>
  )
}

function Choices<T extends string | number>({ label, items, value, onPick, close }: { label: string; items: { value: T; label: string }[]; value: T; onPick: (v: T) => void; close: () => void }) {
  return (
    <div role="menu" aria-label={label} className="rr-menu">
      {items.map((it) => (
        <button
          key={String(it.value)}
          type="button"
          role="menuitemradio"
          aria-checked={it.value === value}
          className="rr-menu-item"
          onClick={() => {
            onPick(it.value)
            close()
          }}
        >
          <span className="rr-menu-tick" aria-hidden="true">{it.value === value ? '✓' : ''}</span>
          {it.label}
        </button>
      ))}
    </div>
  )
}

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
    <svg viewBox="0 0 24 24" aria-hidden="true" className="rr-stroke">
      {t === 'arrow' ? <path d="M5 19L19 5M10 5h9v9" /> : t === 'box' ? <rect x="4" y="6" width="16" height="12" rx="1" /> : <path d="M4 18c3-1 4-6 7-6s2 5 5 5 3-4 4-6" />}
    </svg>
  )
}

/** "now", "5m", "3h", "2d", "3w", "7mo", "1y". */
const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (!Number.isFinite(s) || s < 45) return 'now'
  const m = s / 60
  if (m < 60) return `${Math.max(1, Math.round(m))}m`
  const h = m / 60
  if (h < 24) return `${Math.round(h)}h`
  const d = h / 24
  if (d < 7) return `${Math.round(d)}d`
  if (d < 30) return `${Math.floor(d / 7)}w`
  if (d < 365) return `${Math.max(1, Math.floor(d / 30))}mo`
  return `${Math.floor(d / 365)}y`
}
const longWhen = (iso: string) => new Date(iso).toLocaleString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function When({ iso, edited }: { iso: string; edited?: boolean }) {
  return (
    <time className="rr-when" dateTime={iso} title={longWhen(iso)}>
      <span aria-hidden="true">{ago(iso)}{edited ? ' · edited' : ''}</span>
      <span className="sr-only">{longWhen(iso)}{edited ? ', edited' : ''}</span>
    </time>
  )
}

/* Avatars: Breaking Ice is always copper; everyone else gets a steady colour from their name. */
const AV = ['#7d9cc9', '#6aa88f', '#ad87bd', '#c9a24a', '#d4817a', '#5aaab0', '#9aa3b5']
const avColor = (c: ReviewComment) => {
  if (c.author.kind === 'admin') return 'var(--copper, #c9773f)'
  let h = 0
  for (const ch of c.author.name) h = (h * 31 + ch.charCodeAt(0)) | 0
  return AV[Math.abs(h) % AV.length]
}
const initial = (name: string) => (name.replace(/[^\p{L}\p{N}]/gu, '')[0] ?? '?').toUpperCase()

function Avatar({ c }: { c: ReviewComment }) {
  return (
    <span className="rr-av" style={{ ['--av' as string]: avColor(c) }} aria-hidden="true">
      {initial(c.author.name)}
    </span>
  )
}

function Who({ c }: { c: ReviewComment }) {
  return (
    <span className="rr-who">
      <strong>{c.author.name}</strong>
      {c.author.kind === 'guest' && <span className="rr-tag">Guest</span>}
      {c.author.kind === 'admin' && <span className="rr-tag rr-tag-us">Breaking Ice</span>}
      {c.mine && <span className="sr-only"> (you)</span>}
    </span>
  )
}

function CommentItem({
  c,
  num,
  show,
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
  num?: number
  show: (t: number) => string
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
  const chip = c.tOut !== undefined ? `${show(c.t)} – ${show(c.tOut)}` : show(c.t)
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  // Posted a moment ago and still on its way to the server.
  const pending = c._id.startsWith('pending-')
  const openReply = canWrite && !pending ? () => setReplying((r) => !r) : undefined

  const resolve = canDone && !pending ? (
    <button type="button" className={`rr-resolve${c.done ? ' done' : ''}`} aria-pressed={Boolean(c.done)} onClick={() => onDone(!c.done)} aria-label={c.done ? `Resolved${c.doneBy ? ` by ${c.doneBy}` : ''}. Mark open again` : 'Mark resolved'} title={c.done ? `Resolved${c.doneBy ? ` by ${c.doneBy}` : ''} (click to reopen)` : 'Mark resolved'}>
      <CheckCircle />
    </button>
  ) : c.done ? (
    <span className="rr-resolve done" title={`Resolved${c.doneBy ? ` by ${c.doneBy}` : ''}`}>
      <CheckCircle />
      <span className="sr-only">Resolved{c.doneBy ? ` by ${c.doneBy}` : ''}</span>
    </span>
  ) : null

  return (
    <li ref={ref} className={`rr-card${c.done ? ' done' : ''}${selected ? ' on' : ''}${pending ? ' is-pending' : ''}${replies.length ? ' has-replies' : ''}`} aria-current={selected ? 'true' : undefined} aria-busy={pending || undefined}>
      <Entry
        c={c}
        num={num}
        chip={<button type="button" className="rr-chip" onClick={onGo} aria-label={`Go to ${chip}${c.drawing?.length ? ', with a drawing' : ''}`}>{chip}</button>}
        pending={pending}
        canWrite={canWrite && !pending}
        isAdmin={isAdmin}
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={openReply}
        replying={replying}
        end={resolve}
      />

      {replies.length > 0 && (
        <ol className="rr-replies" aria-label="Replies">
          {replies.map((r) => (
            <li key={r._id}>
              <Entry c={r} canWrite={canWrite} isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} onReply={openReply} replying={replying} />
            </li>
          ))}
        </ol>
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
            className="rr-input"
            rows={2}
            maxLength={2000}
            autoFocus
            value={draft}
            placeholder="Write a reply…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <div className="rr-decide-row">
            <button type="submit" className="rr-cta rr-cta-primary rr-cta-sm" disabled={!draft.trim()}>Reply</button>
            <button type="button" className="rr-link" onClick={() => setReplying(false)}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  )
}

function CheckCircle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  )
}

/** Your own comment for 15 minutes; in the back office, anyone's. */
const canDeleteIt = (c: ReviewComment, canWrite: boolean, isAdmin: boolean) => canWrite && ((Boolean(c.mine) && Date.now() - Date.parse(c.createdAt) < EDIT_MS) || isAdmin)

/**
 * One comment or reply: avatar, name, time and number; the timecode chip and text; then
 * Reply, Edit and Delete, with the resolved tick at the far right of a top comment.
 */
function Entry({
  c,
  num,
  chip,
  pending,
  canWrite,
  isAdmin,
  onEdit,
  onDelete,
  onReply,
  replying,
  end,
}: {
  c: ReviewComment
  num?: number
  chip?: React.ReactNode
  pending?: boolean
  canWrite: boolean
  isAdmin: boolean
  onEdit: (c: ReviewComment, text: string) => Promise<boolean>
  onDelete: (c: ReviewComment) => void
  onReply?: () => void
  replying?: boolean
  end?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(c.text)
  const fresh = Date.now() - Date.parse(c.createdAt) < EDIT_MS
  const canEdit = canWrite && Boolean(c.mine) && fresh
  const canDelete = canDeleteIt(c, canWrite, isAdmin)
  const actions = Boolean(onReply) || canEdit || canDelete || Boolean(end)

  return (
    <div className="rr-entry">
      <Avatar c={c} />
      <div className="rr-entry-main">
        <div className="rr-row1">
          <Who c={c} />
          {pending ? <span className="rr-when">Posting…</span> : <When iso={c.createdAt} edited={Boolean(c.editedAt)} />}
          <span className="rr-row1-end">
            {c.drawing?.length ? (
              <span className="rr-has-drawing" title="Has a drawing">
                <ToolIcon t="pen" />
                <span className="sr-only">Has a drawing.</span>
              </span>
            ) : null}
            {num !== undefined && <span className="rr-num">#{num}</span>}
          </span>
        </div>
        {editing ? (
          <form
            className="rr-reply-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (val.trim() && (await onEdit(c, val.trim()))) setEditing(false)
            }}
          >
            <label className="sr-only" htmlFor={`ed-${c._id}`}>Edit your comment</label>
            <textarea id={`ed-${c._id}`} className="rr-input" rows={2} maxLength={2000} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
            <div className="rr-decide-row">
              <button type="submit" className="rr-cta rr-cta-primary rr-cta-sm" disabled={!val.trim()}>Save</button>
              <button type="button" className="rr-link" onClick={() => { setVal(c.text); setEditing(false) }}>Cancel</button>
            </div>
          </form>
        ) : (
          <p className="rr-text">
            {chip}
            {chip ? ' ' : null}
            {c.text}
          </p>
        )}
        {actions && !editing && (
          <div className="rr-row3">
            {onReply && <button type="button" className="rr-act" onClick={onReply} aria-expanded={replying}>Reply</button>}
            {canEdit && <button type="button" className="rr-act" onClick={() => setEditing(true)}>Edit<span className="sr-only"> your comment</span></button>}
            {canDelete && <button type="button" className="rr-act rr-delete" onClick={() => onDelete(c)}>Delete<span className="sr-only"> comment by {c.author.name}</span></button>}
            {end && <span className="rr-row3-end">{end}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
