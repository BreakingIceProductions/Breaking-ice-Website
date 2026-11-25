'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

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

  // Folded: hovering the rail with a mouse, or tabbing into it, opens it over the page until the pointer or focus leaves.
  const [peek, setPeekRaw] = useState(false)

  // Closing a peek: it stays floating over the page while it slides back to the rail, then rejoins the layout,
  // so the page behind never moves. Set in the same update as peek, so there's no in-between frame.
  const [closing, setClosing] = useState(false)
  const peekRef = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const setPeek = useCallback((v: boolean) => {
    clearTimeout(closeTimer.current)
    if (!v && peekRef.current) {
      setClosing(true)
      closeTimer.current = setTimeout(() => setClosing(false), 180)
    } else if (v) setClosing(false)
    peekRef.current = v
    setPeekRaw(v)
  }, [])
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const toggle = useCallback(() => {
    setPeek(false)
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

  useEffect(() => {
    const side = document.getElementById('a-side')
    if (!side || !collapsed) { setPeek(false); return }
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = (open: boolean, ms: number) => { clearTimeout(timer); timer = setTimeout(() => setPeek(open), ms) }
    const enter = (e: PointerEvent) => { if (e.pointerType === 'mouse') later(true, 120) }
    // Focus from the keyboard keeps it open; focus left behind by a mouse click doesn't.
    const keyFocus = () => Boolean(side.querySelector(':focus-visible'))
    const leave = (e: PointerEvent) => { if (e.pointerType === 'mouse' && !keyFocus()) later(false, 180) }
    const focusIn = (e: FocusEvent) => { if ((e.target as HTMLElement).matches(':focus-visible')) later(true, 0) }
    // Picking a page closes it, so the new page isn't covered.
    const pick = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('a')) later(false, 0) }
    const focusOut = (e: FocusEvent) => { if (!side.contains(e.relatedTarget as Node | null) && !side.matches(':hover')) later(false, 0) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { clearTimeout(timer); setPeek(false); (document.activeElement as HTMLElement | null)?.blur() } }
    side.addEventListener('pointerenter', enter)
    side.addEventListener('pointerleave', leave)
    side.addEventListener('focusin', focusIn)
    side.addEventListener('focusout', focusOut)
    side.addEventListener('keydown', esc)
    side.addEventListener('click', pick)
    return () => {
      clearTimeout(timer)
      side.removeEventListener('pointerenter', enter)
      side.removeEventListener('pointerleave', leave)
      side.removeEventListener('focusin', focusIn)
      side.removeEventListener('focusout', focusOut)
      side.removeEventListener('keydown', esc)
      side.removeEventListener('click', pick)
    }
  }, [collapsed])

  // While it peeks, the sidebar shows its open layout; `collapsed` (and the toggle's label) stay as chosen.
  const open = !collapsed || peek

  // Opening from the rail: the panel widens first, then the words fade in (CSS keys off data-opening), so
  // labels never appear squeezed mid-animation. Only when it actually opens, not on page load.
  const [opening, setOpening] = useState(false)
  const wasOpen = useRef(open)
  useEffect(() => {
    const was = wasOpen.current
    wasOpen.current = open
    if (!open || was) return
    setOpening(true)
    const t = setTimeout(() => setOpening(false), 500)
    return () => clearTimeout(t)
  }, [open])

  const floating = collapsed && (peek || closing)
  return (
    <SideContext.Provider value={{ collapsed, toggle }}>
      <div className="a-shell" data-side={open ? 'open' : 'collapsed'} data-peek={floating ? '' : undefined} data-closing={floating && !peek ? '' : undefined} data-opening={opening ? '' : undefined}>{children}</div>
    </SideContext.Provider>
  )
}

/** The collapse / expand button at the top of the sidebar. Hidden on phone widths. */
export function SideToggle() {
  const { collapsed, toggle } = useContext(SideContext)
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  return (
    <button type="button" className="a-side-toggle" onClick={toggle} aria-expanded={!collapsed} aria-controls="a-side" aria-label={label} title={`${label} ( [ )`}>
      {/* Folded rail: the circular Breaking Ice mark sits at the top (CSS shows it only when folded). */}
      <svg className="a-side-toggle-mark" viewBox="0 0 48 43.9" width="18" height="16.5" aria-hidden="true">
        <polygon points="0,0 20,0 20,29.9 0,43.9" fill="var(--copper)" />
        <polygon points="28,0 48,0 48,29.9 28,43.9" fill="var(--warm-white)" />
      </svg>
      <svg className="a-side-toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        <path d={collapsed ? 'm13.5 10 2 2-2 2' : 'm15.5 10-2 2 2 2'} />
      </svg>
    </button>
  )
}
