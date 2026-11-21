'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState, type KeyboardEvent } from 'react'
import { PlayerButton } from './video'

export type CarouselStory = {
  id: string
  slug: string
  title: string
  client?: string
  job?: string
  meta: string
  poster: string | null
  posterAlt: string
  video?: string
}

const two = (n: number) => String(n).padStart(2, '0')

/**
 * One featured story at a time: a big film frame (play opens the full film) and a card beside it.
 * Prev / next, a counter and dots; arrow keys inside the carousel; swipe on touch. Never moves on its own.
 * Every slide sits in the same grid cell and only the current one shows, so nothing jumps between stories.
 */
export function StoryCarousel({ stories, jobLabel }: { stories: CarouselStory[]; jobLabel: string }) {
  const [i, setI] = useState(0)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const n = stories.length
  if (!n) return null
  const go = (k: number) => setI(((k % n) + n) % n)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // The film player opens in a portal; its keys bubble through React, so ignore anything outside the carousel itself.
    if (!e.currentTarget.contains(e.target as Node)) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1) }
  }
  const cur = stories[i]

  return (
    <div
      className="fc"
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured stories"
      onKeyDown={onKey}
      onTouchStart={(e) => { touch.current = e.currentTarget.contains(e.target as Node) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null }}
      onTouchEnd={(e) => {
        const t = touch.current
        touch.current = null
        if (!t) return
        const dx = e.changedTouches[0].clientX - t.x
        const dy = e.changedTouches[0].clientY - t.y
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? i + 1 : i - 1)
      }}
    >
      <div className="fc-stage">
        {stories.map((s, k) => (
          <div
            key={s.id}
            className={`fc-slide${k === i ? ' on' : ''}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${k + 1} of ${n}: ${s.title}`}
            aria-hidden={k !== i}
            inert={k !== i}
          >
            <div className="fc-frame media ratio-169 on-dark">
              {s.poster && <Image src={s.poster} alt={s.posterAlt} fill sizes="(max-width: 820px) 100vw, 60vw" style={{ objectFit: 'cover' }} />}
              {s.video && (
                <PlayerButton url={s.video} className="fc-play" trackAs={`Home story: ${s.title}`}>
                  <span className="fc-play-ring" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5l12 7-12 7z" fill="currentColor" /></svg>
                  </span>
                  <span className="sr-only">Play the film: {s.title}</span>
                </PlayerButton>
              )}
            </div>
            <div className="fc-card">
              {s.client && <span className="fc-client">{s.client}</span>}
              <h3 className="h3 fc-story">
                <Link href={`/stories/${s.slug}`}>{s.title}</Link>
              </h3>
              {s.job && (
                <div className="fc-job">
                  <span className="label fc-job-label">{jobLabel}</span>
                  <p>{s.job}</p>
                </div>
              )}
              {s.meta && <p className="fc-meta">{s.meta}</p>}
              <Link className="link-arrow" href={`/stories/${s.slug}`}>
                Read the story <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {n > 1 && (
        <div className="fc-controls">
          <button type="button" className="round-btn" aria-label="Previous story" onClick={() => go(i - 1)}>←</button>
          <button type="button" className="round-btn" aria-label="Next story" onClick={() => go(i + 1)}>→</button>
          <span className="fc-count" aria-hidden="true">
            {two(i + 1)} <span className="fc-count-sep">—</span> {two(n)}
          </span>
          <div className="fc-dots">
            {stories.map((s, k) => (
              <button
                key={s.id}
                type="button"
                className="fc-dot"
                aria-label={`Show story ${k + 1}: ${s.title}`}
                aria-current={k === i ? 'true' : undefined}
                onClick={() => go(k)}
              />
            ))}
          </div>
          <span className="sr-only" aria-live="polite" aria-atomic="true">Story {i + 1} of {n}: {cur.title}</span>
        </div>
      )}
    </div>
  )
}

/** “Is this you?” Five ticks in a white card. The closing line lights up from two ticks. */
export function FitChecklist({ items, closing, cta }: { items: { line: string; subline?: string }[]; closing: string; cta: string }) {
  const [on, setOn] = useState<boolean[]>(() => items.map(() => false))
  const count = on.filter(Boolean).length
  return (
    <div className={`fit-card${count >= 2 ? ' is-ready' : ''}`}>
      <ul className="fit-list">
        {items.map((it, k) => (
          <li key={k}>
            <label className="fit-item">
              <input type="checkbox" checked={on[k]} onChange={() => setOn((o) => o.map((v, j) => (j === k ? !v : v)))} />
              <span className="fit-text">
                <strong>{it.line}</strong>
                {it.subline && <em>{it.subline}</em>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="fit-foot">
        <p className="fit-closing">{closing}</p>
        <Link href="/contact" className="btn btn-primary">{cta}</Link>
      </div>
      <span className="sr-only" aria-live="polite">{count ? `${count} of ${items.length} ticked.` : ''}</span>
    </div>
  )
}
