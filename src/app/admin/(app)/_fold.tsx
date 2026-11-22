'use client'

import { useLayoutEffect, useRef } from 'react'

/**
 * A section that is open on a wide screen and folded on a phone (820px and under), so long pages
 * start short on a phone without hiding anything on a desktop. Opens itself when a link points at it
 * (#id). Before it hydrates, admin-pages.css hides its content on a phone so nothing jumps.
 */
export function PhoneFold({ id, className, summary, labelledBy, children }: { id?: string; className?: string; summary: React.ReactNode; labelledBy?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const phone = window.matchMedia('(max-width: 820px)').matches
    const aimed = () => Boolean(id) && window.location.hash === `#${id}`
    el.open = !phone || aimed()
    el.dataset.ready = ''
    const onHash = () => { if (aimed()) el.open = true }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [id])
  return (
    <details ref={ref} id={id} className={`ap-fold ${className ?? ''}`} open aria-labelledby={labelledBy}>
      <summary>{summary}</summary>
      {children}
    </details>
  )
}
