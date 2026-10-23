'use client'

import { track } from '@vercel/analytics'
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const KEY = 'bi-theme'

/** Sun/moon button. First visit follows the device setting; a click is remembered. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
    // Until someone picks, keep following the device (e.g. phones that switch at sunset).
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      let saved: string | null = null
      try { saved = localStorage.getItem(KEY) } catch {}
      if (saved) return
      const t: Theme = e.matches ? 'dark' : 'light'
      document.documentElement.dataset.theme = t
      setTheme(t)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function toggle() {
    const root = document.documentElement
    const next: Theme = (root.dataset.theme === 'dark' ? 'light' : 'dark')
    const apply = () => {
      root.dataset.theme = next
      try { localStorage.setItem(KEY, next) } catch {}
      setTheme(next)
    }
    track('Theme switch', { theme: next })
    // A soft gradient wipe across the page (see .theme-wipe in globals.css). Instant for reduced motion
    // or browsers without View Transitions.
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !doc.startViewTransition) {
      apply()
      return
    }
    root.classList.add('theme-wipe')
    doc.startViewTransition(apply).finished.finally(() => root.classList.remove('theme-wipe'))
  }

  return (
    <button
      type="button"
      className="theme-btn"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : theme === 'light' ? 'Switch to dark mode' : 'Switch colour theme'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      <svg className="i-moon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
      </svg>
      <svg className="i-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </svg>
    </button>
  )
}
