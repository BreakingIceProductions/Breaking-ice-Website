'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { urlFor } from '@/sanity/client'
import type { Img } from '@/lib/types'
import { Still } from './brand'

type Shot = NonNullable<Img> & { _key?: string }

const hasAsset = (img: Img | undefined): img is Shot => Boolean(img?.asset)

/**
 * The stills gallery. Desktop: the 8/4/4 grid (or a 2-up grid of big images for
 * photo stories). Mobile: a swipe rail with a "1 / 5 · SWIPE" counter.
 * Tapping a real still (not a placeholder) opens it large in a lightbox.
 */
export function Stills({ images, variant = 'film' }: { images: (Img | undefined)[]; variant?: 'film' | 'photo' }) {
  const railRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const isPhoto = variant === 'photo'
  const shots = images.filter(hasAsset)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const items = Array.from(rail.children) as HTMLElement[]
        const left = rail.scrollLeft
        let best = 0
        items.forEach((el, i) => {
          if (Math.abs(el.offsetLeft - rail.offsetLeft - left) < Math.abs(items[best].offsetLeft - rail.offsetLeft - left)) best = i
        })
        // At the very end of the rail the last item may never reach the left edge.
        if (left + rail.clientWidth >= rail.scrollWidth - 2) best = items.length - 1
        setCurrent(best)
      })
    }
    rail.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      rail.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <>
      <p className="stills-count eyebrow" aria-hidden="true">
        {current + 1} / {images.length} · Swipe
      </p>
      <div ref={railRef} className={`gallery stills-rail ${isPhoto ? 'gallery-photo' : ''}`}>
        {images.map((img, i) => {
          const big = !isPhoto && i === 0
          const still = (
            <Still
              image={img}
              label={`Still ${i + 1}`}
              ratio={isPhoto ? 'ratio-43' : big ? 'ratio-169' : 'ratio-43'}
              cut={big}
              width={isPhoto || big ? 1400 : 800}
              sizes={isPhoto || big ? '(max-width: 820px) 85vw, 66vw' : '(max-width: 820px) 85vw, 33vw'}
            />
          )
          const key = (img as Shot | null)?._key ?? i
          if (!hasAsset(img)) return <figure key={key} className="still-item">{still}</figure>
          const shotIndex = shots.indexOf(img)
          return (
            <figure key={key} className="still-item">
              <button
                type="button"
                className="still-open"
                aria-label={`View larger: ${img.alt || img.caption || `still ${i + 1}`}`}
                onClick={() => setOpen(shotIndex)}
              >
                {still}
              </button>
              {img.caption && <figcaption className="caption still-caption">{img.caption}</figcaption>}
            </figure>
          )
        })}
      </div>
      {open !== null && <StillsLightbox shots={shots} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}

/** A single still (the People image) that opens in the same lightbox, with its caption below. */
export function SingleStill({ image, label, ratio = 'ratio-45', width = 900 }: { image?: Img; label: string; ratio?: string; width?: number }) {
  const [open, setOpen] = useState(false)
  const still = <Still image={image} label={label} ratio={ratio} width={width} />
  if (!hasAsset(image)) return still
  return (
    <figure className="still-item" style={{ margin: 0 }}>
      <button type="button" className="still-open" aria-label={`View larger: ${image.alt || image.caption || label}`} onClick={() => setOpen(true)}>
        {still}
      </button>
      {image.caption && <figcaption className="caption still-caption">{image.caption}</figcaption>}
      {open && <StillsLightbox shots={[image]} index={0} onIndex={() => {}} onClose={() => setOpen(false)} />}
    </figure>
  )
}

function StillsLightbox({ shots, index, onIndex, onClose }: { shots: Shot[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const many = shots.length > 1
  const shot = shots[index]
  const go = useCallback((step: number) => onIndex((index + step + shots.length) % shots.length), [index, onIndex, shots.length])

  // Focus in on open, back to the still on close; lock page scroll meanwhile.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && many) go(1)
      else if (e.key === 'ArrowLeft' && many) go(-1)
      else if (e.key === 'Tab' && dialogRef.current) {
        // Keep keyboard focus inside the dialog.
        const f = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button'))
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, many, onClose])

  if (!shot) return null
  return createPortal(
    <div ref={dialogRef} className="lightbox stills-lightbox" role="dialog" aria-modal="true" aria-label="Stills" onClick={onClose}>
      <button ref={closeRef} className="lightbox-close" type="button" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <figure className="lightbox-inner stills-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <div className="stills-lightbox-frame" key={shot._key ?? index}>
          <Image
            src={urlFor(shot).width(2400).fit('max').url()}
            alt={shot.alt || ''}
            fill
            sizes="(max-width: 1200px) 100vw, 1200px"
            style={{ objectFit: 'contain' }}
          />
        </div>
        <figcaption className="stills-lightbox-caption">
          <span>{shot.caption}</span>
          {many && <span className="stills-lightbox-count" aria-live="polite">{index + 1} / {shots.length}</span>}
        </figcaption>
      </figure>
      {many && (
        <>
          <button type="button" className="stills-nav stills-prev" aria-label="Previous still" onClick={(e) => { e.stopPropagation(); go(-1) }}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
          <button type="button" className="stills-nav stills-next" aria-label="Next still" onClick={(e) => { e.stopPropagation(); go(1) }}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
