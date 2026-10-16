'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Wraps a list (its single child) that becomes a horizontal scroll-snap rail on phones (≤820px, see pages.css).
 * Shows a small "n / N · SWIPE" counter that follows the scroll. On wider screens the list lays out as normal.
 */
export function SwipeRail({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [count, setCount] = useState(0)

  useEffect(() => {
    const rail = ref.current?.firstElementChild as HTMLElement | null
    if (!rail) return
    const items = Array.from(rail.children) as HTMLElement[]
    setCount(items.length)
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const start = rail.getBoundingClientRect().left + parseFloat(getComputedStyle(rail).paddingLeft || '0')
        let best = 0
        let bestDist = Infinity
        items.forEach((el, i) => {
          const d = Math.abs(el.getBoundingClientRect().left - start)
          if (d < bestDist) {
            bestDist = d
            best = i
          }
        })
        // At the very end the last card may never reach the start edge.
        if (rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2) best = items.length - 1
        setIndex(best)
      })
    }
    rail.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      rail.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <div ref={ref} className={`swipe-rail ${className}`}>
      {children}
      {count > 1 && (
        <p className="rail-count" aria-hidden="true">
          {index + 1} / {count} · Swipe
        </p>
      )}
    </div>
  )
}
