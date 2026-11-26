'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

const KEY = 'bi-admin-trail'

function read(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Back to the last back-office page, top left of every page. It keeps its own trail of pages in this tab
 * (sessionStorage), so it only shows when there's a back-office page to go back to, never off to another site.
 */
export function BackButton() {
  const router = useRouter()
  const path = usePathname()
  const query = useSearchParams().toString()
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    const here = query ? `${path}?${query}` : path
    const trail = read()
    if (trail[trail.length - 1] === here) {
      // A reload or a re-render: nothing moved.
    } else if (trail[trail.length - 2] === here) trail.pop() // went back
    else trail.push(here)
    const kept = trail.slice(-50)
    try { sessionStorage.setItem(KEY, JSON.stringify(kept)) } catch {}
    setCanGoBack(kept.length > 1)
  }, [path, query])

  if (!canGoBack) return null
  return (
    <button type="button" className="a-back" onClick={() => router.back()} aria-label="Back to the last page" title="Back">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      <span>Back</span>
    </button>
  )
}
