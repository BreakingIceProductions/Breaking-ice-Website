'use client'

import { useLayoutEffect, useRef } from 'react'

/**
 * A section that is open on a wide screen and folded on a phone (820px and under), so long pages
 * start short on a phone without hiding anything on a desktop. Opens itself when a link points at it
 * (#id). Before it hydrates, admin-pages.css hides its content on a phone so nothing jumps.
 * `folded` keeps it closed on every screen (secondary detail), still opening when a link points at it.
 */
export function PhoneFold({ id, className, summary, labelledBy, folded, children }: { id?: string; className?: string; summary: React.ReactNode; labelledBy?: string; folded?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const phone = folded || window.matchMedia('(max-width: 820px)').matches
    const aimed = () => Boolean(id) && window.location.hash === `#${id}`
    el.open = !phone || aimed()
    el.dataset.ready = ''
    const onHash = () => { if (aimed()) el.open = true }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [id, folded])
  return (
    <details ref={ref} id={id} className={`ap-fold ${className ?? ''}`} open={!folded} aria-labelledby={labelledBy}>
      <summary>{summary}</summary>
      {children}
    </details>
  )
}
