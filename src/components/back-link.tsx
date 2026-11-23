'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect } from 'react'

/**
 * “← Back” on every public page except Home.
 *
 * It goes back in the browser's history only when the previous entry is a page on this site, so the visitor lands
 * exactly where they were (Next restores the scroll; `data-scroll-behavior="smooth"` on <html> makes that instant).
 * A visitor who arrived from Google or another site goes to a sensible parent page instead.
 *
 * NavTracker keeps a small stack of in-site pages for this tab in sessionStorage: a new page is pushed, a browser
 * back (popstate) to the page before pops.
 */

const KEY = 'bi-nav-stack'

function readStack(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-50)))
  } catch {
    /* private mode or storage blocked: the button falls back to the parent page */
  }
}

/** Where “Back” goes when there is no in-site page to return to. */
export function parentOf(path: string): string {
  if (/^\/stories\/[^/]+/.test(path)) return '/stories'
  if (/^\/services\/[^/]+/.test(path)) return '/services'
  if (/^\/(alberta|northwest-territories)\/?$/.test(path)) return '/locations'
  return '/'
}

/** Pages whose breadcrumb carries the Back link itself, so the slim row is left out there. */
const HAS_OWN_BACK = /^\/(?:$|stories\/[^/]+|services\/[^/]+|alberta\/?$|northwest-territories\/?$)/

let popped = false
/** False until the first page of this document is recorded (module state lives as long as the document). */
let started = false

const POS = 'bi-nav-scroll'
/** One saved scroll position per page in the trail, keyed by its place in the trail and its path. */
const posKey = (stack: string[]) => `${stack.length - 1}:${stack[stack.length - 1]}`
function readPos(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(POS) ?? '{}') ?? {}
  } catch {
    return {}
  }
}
function savePos(key: string, y: number) {
  try {
    const all = readPos()
    all[key] = Math.round(y)
    sessionStorage.setItem(POS, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function NavTracker() {
  const path = usePathname()

  useEffect(() => {
    const onPop = () => { popped = true }
    window.addEventListener('popstate', onPop)
    // Remember where the visitor is on each page, so going back can land on the same spot.
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const stack = readStack()
        if (stack[stack.length - 1] === window.location.pathname) savePos(posKey(stack), window.scrollY)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  // Layout effect: runs before the browser paints the page, so a restored page never flashes at the top.
  useLayoutEffect(() => {
    let stack = readStack()
    let restore = false
    if (!started) {
      // First page of this document. A fresh arrival from another site (or a typed address) starts a new trail;
      // a reload or a browser back/forward into the site keeps the trail it had.
      started = true
      const entry = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined
      let fromHere = false
      try {
        fromHere = Boolean(document.referrer) && new URL(document.referrer).origin === location.origin
      } catch {
        fromHere = false
      }
      if (entry?.type === 'navigate' && !fromHere) stack = [path]
      else if (stack[stack.length - 1] !== path) stack.push(path)
    } else if (stack[stack.length - 1] === path) {
      // Same page (e.g. a search-param change): nothing to do.
    } else if (popped && stack[stack.length - 2] === path) {
      stack.pop()
      restore = true
    } else {
      stack.push(path)
    }
    popped = false
    writeStack(stack)
    // Back to a page in the trail: put the visitor exactly where they were, at once (no animated scroll from the top).
    // The browser's own restore can come late in a client-side page change, after the page has painted at the top.
    if (restore) {
      const y = readPos()[posKey(stack)]
      if (typeof y === 'number') {
        window.scrollTo({ top: y, behavior: 'instant' })
        requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y, behavior: 'instant' }) })
      }
    }
  }, [path])

  return null
}

export function BackLink({ className = '' }: { className?: string }) {
  const path = usePathname()
  const router = useRouter()
  return (
    <Link
      href={parentOf(path)}
      className={`back-link ${className}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        const stack = readStack()
        if (stack.length > 1 && stack[stack.length - 1] === path) {
          e.preventDefault()
          router.back()
        }
      }}
    >
      <span aria-hidden="true">←</span> Back
    </Link>
  )
}

/** The slim row under the header, for pages without their own breadcrumb. Not on Home. */
export function BackRow() {
  const path = usePathname()
  if (HAS_OWN_BACK.test(path)) return null
  return (
    <div className="back-row">
      <div className="wrap">
        <BackLink />
      </div>
    </div>
  )
}
