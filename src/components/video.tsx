'use client'

import { track } from '@vercel/analytics'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { embedUrl } from '@/lib/video'
import { Placeholder } from './brand'

/**
 * Silent preview loop. Shows the poster first (fast), and only loads the
 * YouTube/Vimeo player once the box scrolls into view. Skipped entirely
 * for visitors who prefer reduced motion.
 */
export function VideoLoop({
  url,
  posterUrl,
  posterAlt = '',
  label = 'Preview loop',
  className = '',
  onDark,
  priority,
  startAt = 0.25,
  segment = 12,
  hoverOnly,
}: {
  url?: string
  posterUrl?: string | null
  posterAlt?: string
  label?: string
  className?: string
  onDark?: boolean
  priority?: boolean
  /** Where a Vimeo preview starts, as a fraction of the film (intros are often slow or a single colour). */
  startAt?: number
  /** How many seconds the preview plays before it loops back to that point. */
  segment?: number
  /** Stay a still image until the pointer is over the card, then play the preview. Touch devices stay still. */
  hoverOnly?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const hotRef = useRef(false)
  const syncRef = useRef<(() => void) | null>(null)
  const [live, setLive] = useState(false)
  const [shown, setShown] = useState(false)
  const [hot, setHot] = useState(false)
  const src = embedUrl(url, 'loop')
  const isVimeo = !!src && src.startsWith('https://player.vimeo.com/')
  // A Vimeo link can pin its own clip: vimeo.com/123#t=95 (or #t=1m35s) loops from that moment instead of startAt.
  const pinnedAt = startSeconds(url)

  // hoverOnly: load and play while the pointer is over the card; pause and return to the still when it leaves
  useEffect(() => {
    if (!hoverOnly || !src || !ref.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const host = (ref.current.closest('.card, .proj-card') as HTMLElement | null) ?? ref.current
    const enter = () => { hotRef.current = true; setLive(true); setHot(true) }
    const leave = () => { hotRef.current = false; setHot(false); setShown(false) }
    host.addEventListener('pointerenter', enter)
    host.addEventListener('pointerleave', leave)
    host.addEventListener('focusin', enter)
    host.addEventListener('focusout', leave)
    return () => { host.removeEventListener('pointerenter', enter); host.removeEventListener('pointerleave', leave); host.removeEventListener('focusin', enter); host.removeEventListener('focusout', leave) }
  }, [hoverOnly, src])

  useEffect(() => {
    if (hoverOnly) return
    if (!src || !ref.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setLive(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [src, hoverOnly])

  // Vimeo previews: jump to ~25% in, fade in only once there, and loop a short segment from that point.
  useEffect(() => {
    if (!live || !isVimeo) return
    const f = frame.current
    if (!f) return
    let start = -1
    const isActive = () => !hoverOnly || hotRef.current
    const post = (m: Record<string, unknown>) => f.contentWindow?.postMessage(JSON.stringify(m), 'https://player.vimeo.com')
    const onLoad = () => {
      post({ method: 'addEventListener', value: 'timeupdate' })
      post({ method: 'addEventListener', value: 'finish' })
    }
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== 'https://player.vimeo.com' || e.source !== f.contentWindow) return
      let d: { event?: string; data?: { seconds?: number; duration?: number } }
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
      if (d.event === 'finish' && start >= 0) { post({ method: 'setCurrentTime', value: start }); post({ method: 'play' }); return }
      if ((d.event !== 'timeupdate' && d.event !== 'playProgress') || !d.data) return
      const { seconds = 0, duration = 0 } = d.data
      if (start < 0) {
        if (duration > 0) { start = pinnedAt ?? duration * startAt; post({ method: 'setCurrentTime', value: start }) }
        return
      }
      if (seconds >= start - 0.3 && isActive()) setShown(true)
      if (seconds > start + segment) post({ method: 'setCurrentTime', value: start })
    }
    f.addEventListener('load', onLoad)
    window.addEventListener('message', onMsg)
    const fallback = window.setTimeout(() => { if (isActive()) setShown(true) }, 4500)
    // hoverOnly: play while hot, pause when not
    const sync = () => {
      const on = isActive()
      post({ method: on ? 'play' : 'pause' })
      if (!on) { setShown(false); return }
      // Resuming: show straight away if we already know where we are, otherwise give the player a moment, then show anyway.
      window.setTimeout(() => { if (isActive()) setShown(true) }, start >= 0 ? 0 : 2500)
    }
    syncRef.current = sync
    return () => { syncRef.current = null; f.removeEventListener('load', onLoad); window.removeEventListener('message', onMsg); window.clearTimeout(fallback) }
  }, [live, isVimeo, startAt, pinnedAt, segment, hoverOnly])

  useEffect(() => {
    hotRef.current = hot
    syncRef.current?.()
  }, [hot])

  return (
    <div ref={ref} className={`media ${onDark ? 'on-dark' : ''} ${className}`}>
      {posterUrl ? (
        <Image src={posterUrl} alt={posterAlt} fill sizes="(max-width: 820px) 100vw, 60vw" priority={priority} style={{ objectFit: 'cover' }} />
      ) : (
        !src && label && <Placeholder label={label} play />
      )}
      {live && src && (
        <iframe
          ref={frame}
          src={src}
          title=""
          aria-hidden="true"
          tabIndex={-1}
          allow="autoplay; fullscreen"
          loading="lazy"
          style={isVimeo ? { opacity: shown && (!hoverOnly || hot) ? 1 : 0, transition: 'opacity .6s ease' } : undefined}
        />
      )}
    </div>
  )
}

/** A full player with sound, opened in a lightbox. Esc closes. */
export function PlayerButton({
  url,
  children,
  className = 'reel-link',
  trackAs = 'Video',
  captions,
}: {
  url?: string
  children: React.ReactNode
  className?: string
  trackAs?: string
  /** The film has captions: start the player with them switched on. */
  captions?: boolean
}) {
  const [open, setOpen] = useState(false)
  const src = embedUrl(url, 'play', { captions })
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)

  // Focus in on open, back to the button on close; keep Tab inside the dialog meanwhile.
  useEffect(() => {
    if (!open) return
    const opener = openerRef.current
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      else if (e.key === 'Tab' && dialogRef.current) {
        const f = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, iframe'))
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      opener?.focus()
    }
  }, [open])

  return (
    <>
      <button ref={openerRef} type="button" className={className} onClick={() => { setOpen(true); track('Video play', { video: trackAs, page: window.location.pathname }) }}>
        {children}
      </button>
      {open &&
        createPortal(
          <div ref={dialogRef} className="lightbox" role="dialog" aria-modal="true" aria-label={`Video player: ${trackAs}`} onClick={() => setOpen(false)}>
            <button ref={closeRef} className="lightbox-close" type="button" aria-label="Close video" onClick={() => setOpen(false)}>
              ×
            </button>
            <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
              <div className="media ratio-169 on-dark">
                {src ? (
                  <iframe src={src} title={trackAs} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
                ) : (
                  <Placeholder label="The full film plays here once a YouTube or Vimeo link is added in the Studio" play />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** Seconds from a `#t=95`, `#t=95s` or `#t=1m35s` fragment, or null when the link has none. */
function startSeconds(url?: string): number | null {
  const m = url?.match(/#t=(?:(\d+)m)?(\d+(?:\.\d+)?)s?$/)
  if (!m) return null
  return Number(m[1] ?? 0) * 60 + Number(m[2])
}
