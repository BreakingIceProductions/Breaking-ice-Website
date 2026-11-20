'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/** Cookie + localStorage key for the sidebar's collapsed state. */
export const SIDE_KEY = 'bi-admin-side'

type Side = { collapsed: boolean; toggle: () => void }
const SideContext = createContext<Side>({ collapsed: false, toggle: () => {} })

/** True when the collapse state is in play; on phone widths the sidebar is a top bar and stays expanded. */
export const useSideCollapsed = () => useContext(SideContext).collapsed

function save(collapsed: boolean) {
  const v = collapsed ? 'collapsed' : 'open'
  try { localStorage.setItem(SIDE_KEY, v) } catch {}
  try { document.cookie = `${SIDE_KEY}=${v}; path=/admin; max-age=31536000; samesite=lax` } catch {}
}

/**
 * The back-office shell. The server reads the cookie and passes `initial`, so the first paint already has the
 * right width and the client renders the same markup (no flash, no hydration mismatch). localStorage mirrors the
 * choice and fills in if the cookie was cleared.
 */
export function SideShell({ initial, children }: { initial: boolean; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(initial)

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      save(!c)
      return !c
    })
  }, [])

  useEffect(() => {
    let stored: string | null = null
    try { stored = localStorage.getItem(SIDE_KEY) } catch {}
    // The cookie went missing (cleared, new path) but this browser remembers: restore it and rewrite the cookie.
    if (!initial && stored === 'collapsed') {
      setCollapsed(true)
      save(true)
    }
  }, [initial])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (document.querySelector('dialog[open]')) return
      if (window.matchMedia('(max-width: 820px)').matches) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return (
    <SideContext.Provider value={{ collapsed, toggle }}>
      <div className="a-shell" data-side={collapsed ? 'collapsed' : 'open'}>{children}</div>
    </SideContext.Provider>
  )
}

/** The collapse / expand button at the top of the sidebar. Hidden on phone widths. */
export function SideToggle() {
  const { collapsed, toggle } = useContext(SideContext)
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  return (
    <button type="button" className="a-side-toggle" onClick={toggle} aria-expanded={!collapsed} aria-controls="a-side" aria-label={label} title={`${label} ( [ )`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        <path d={collapsed ? 'm13.5 10 2 2-2 2' : 'm15.5 10-2 2 2 2'} />
      </svg>
    </button>
  )
}
