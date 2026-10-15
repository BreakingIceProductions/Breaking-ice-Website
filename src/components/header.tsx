'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { Settings } from '@/lib/types'
import { Logo } from './brand'
import { ThemeToggle } from './theme-toggle'

type NavLoc = Settings['locations'][number]

export function Header({ locations, cta }: { locations: NavLoc[]; cta: string }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [path])
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cur = (href: string) => (href === '/' ? path === '/' : path.startsWith(href)) ? 'page' : undefined

  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="logo-link" aria-label="Breaking Ice Productions, home">
          <Logo className="logo-for-light" />
          <Logo tone="dark" className="logo-for-dark" />
        </Link>
        <nav className="main-nav" aria-label="Main">
          <Link href="/stories" aria-current={cur('/stories')}>Stories</Link>
          <Link href="/services" aria-current={cur('/services')}>Services</Link>
          <Link href="/about" aria-current={cur('/about')}>About</Link>
          <span className="nav-group">
            {locations.map((l, i) => (
              <span key={l._id} className="nav-group">
                {i > 0 && <span className="nav-sep" aria-hidden="true">·</span>}
                <Link href={`/${l.slug}`} aria-current={cur(`/${l.slug}`)}>{l.title}</Link>
              </span>
            ))}
          </span>
          <Link href="/contact" aria-current={cur('/contact')}>Contact</Link>
        </nav>
        <div className="header-tools">
          <Link href="/contact" className="btn btn-primary header-cta">{cta}</Link>
          <ThemeToggle />
          <button ref={btnRef} type="button" className="menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16" /></svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="mobile-menu dark" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="mobile-menu-top">
            <Link href="/" aria-label="Breaking Ice Productions, home"><Logo tone="dark" height={30} /></Link>
            <button ref={closeRef} type="button" className="menu-btn" aria-label="Close menu" onClick={() => setOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <nav aria-label="Main">
            <Link href="/">Home</Link>
            <Link href="/stories">Stories</Link>
            <Link href="/services">Services</Link>
            <Link href="/about">About</Link>
            <span className="eyebrow" style={{ marginTop: 16 }}>Locations</span>
            {locations.map((l) => (
              <Link key={l._id} href={`/${l.slug}`} className="small">{l.title}</Link>
            ))}
            <Link href="/contact" style={{ marginTop: 12 }}>Contact</Link>
          </nav>
          <Link href="/contact" className="btn btn-primary" style={{ width: '100%' }}>{cta}</Link>
        </div>
      )}
    </header>
  )
}
