'use client'

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
}: {
  url?: string
  posterUrl?: string | null
  posterAlt?: string
  label?: string
  className?: string
  onDark?: boolean
  priority?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState(false)
  const src = embedUrl(url, 'loop')

  useEffect(() => {
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
  }, [src])

  return (
    <div ref={ref} className={`media ${onDark ? 'on-dark' : ''} ${className}`}>
      {posterUrl ? (
        <Image src={posterUrl} alt={posterAlt} fill sizes="(max-width: 820px) 100vw, 60vw" priority={priority} style={{ objectFit: 'cover' }} />
      ) : (
        !src && label && <Placeholder label={label} play />
      )}
      {live && src && <iframe src={src} title="" aria-hidden="true" tabIndex={-1} allow="autoplay; fullscreen" loading="lazy" />}
    </div>
  )
}

/** A full player with sound, opened in a lightbox. Esc closes. */
export function PlayerButton({ url, children, className = 'reel-link' }: { url?: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const src = embedUrl(url, 'play')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open &&
        createPortal(
          <div className="lightbox" role="dialog" aria-modal="true" aria-label="Video player" onClick={() => setOpen(false)}>
            <button ref={closeRef} className="lightbox-close" type="button" aria-label="Close video" onClick={() => setOpen(false)}>
              ×
            </button>
            <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
              <div className="media ratio-169 on-dark">
                {src ? (
                  <iframe src={src} title="Video" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
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
