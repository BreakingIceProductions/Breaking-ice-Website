'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))

/**
 * The site's quiet details: reveal-on-scroll, headline words, a touch of parallax, a progress line and back-to-top.
 * Motion is skipped for visitors who ask for reduced motion. Without JS the page is simply the plain page.
 */
export function Motion() {
  const pathname = usePathname()
  const barRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLButtonElement>(null)

  // Global behaviours (once)
  useEffect(() => {
    const root = document.documentElement
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cleanups: Array<() => void> = []

    // Progress line + back to top (these are fine with reduced motion; they are information, not decoration)
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const y = window.scrollY
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? clamp(y / max) : 0})`
        if (topRef.current) topRef.current.classList.toggle('show', y > 900)
        if (!reduced) {
          const splash = document.querySelector<HTMLElement>('.splash')
          if (splash) splash.style.setProperty('--sp', String(clamp(y / (splash.offsetHeight * 0.75))))
          const hero = document.querySelector<HTMLElement>('.hero')
          if (hero) {
            const r = hero.getBoundingClientRect()
            if (r.bottom > 0 && r.top < window.innerHeight) hero.style.setProperty('--hy', `${Math.round((window.innerHeight - r.top) * 0.08)}px`)
          }
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    cleanups.push(() => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) })

    if (reduced) return () => cleanups.forEach((f) => f())
    root.classList.add('motion')

    cleanups.push(() => root.classList.remove('motion'))
    return () => cleanups.forEach((f) => f())
  }, [])

  // Per page: reveal on scroll, headline words, count-up
  useEffect(() => {
    if (!document.documentElement.classList.contains('motion')) return
    const observers: IntersectionObserver[] = []
    const timers: number[] = []
    const t = window.setTimeout(() => {
      const vh = window.innerHeight
      // 1) reveal targets: direct children of each section's wrap; grids reveal child by child
      const groups: HTMLElement[][] = []
      document.querySelectorAll<HTMLElement>('main section:not(.splash) .wrap, main .page-head .wrap').forEach((wrap) => {
        Array.from(wrap.children).forEach((child) => {
          const el = child as HTMLElement
          if (el.classList.contains('split-h') || el.classList.contains('logo-strip')) return
          const kids = Array.from(el.children) as HTMLElement[]
          if (kids.length > 1 && getComputedStyle(el).display === 'grid') groups.push(kids)
          else groups.push([el])
        })
      })
      document.querySelectorAll<HTMLElement>('.hero-content > *').forEach((el) => { if (!el.classList.contains('split-h')) groups.push([el]) })
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { (en.target as HTMLElement).classList.add('rv-in'); io.unobserve(en.target) } })
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
      observers.push(io)
      groups.forEach((g) => g.forEach((el, i) => {
        if (el.classList.contains('rv')) return
        if (el.getBoundingClientRect().top < vh * 0.9 && el.getBoundingClientRect().bottom > 0) return
        el.classList.add('rv')
        el.style.setProperty('--rv-d', `${Math.min(i, 5) * 90}ms`)
        io.observe(el)
      }))

      // 2) headline words
      const ho = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); ho.unobserve(en.target) } })
      }, { threshold: 0.35 })
      observers.push(ho)
      document.querySelectorAll('.split-h').forEach((h) => ho.observe(h))

      // 3) count-up for real numbers
      const co = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return
          co.unobserve(en.target)
          const el = en.target as HTMLElement
          const m = (el.dataset.final ?? '').match(/^(\D*)([\d,.]+)(.*)$/)
          if (!m) return
          const end = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] ?? '').length
          const t0 = performance.now(), dur = 1500
          const step = (now: number) => {
            const p = clamp((now - t0) / dur), e = 1 - Math.pow(1 - p, 3)
            el.textContent = `${m[1]}${(end * e).toLocaleString('en-CA', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${m[3]}`
            if (p < 1) requestAnimationFrame(step); else el.textContent = el.dataset.final ?? ''
          }
          requestAnimationFrame(step)
        })
      }, { threshold: 0.6 })
      observers.push(co)
      document.querySelectorAll<HTMLElement>('.stat-value').forEach((el) => {
        const txt = (el.textContent ?? '').trim()
        if (!txt || txt.includes('[') || !/\d/.test(txt) || el.dataset.final) return
        el.dataset.final = txt
        co.observe(el)
      })
    }, 120)
    timers.push(t)
    return () => { timers.forEach(clearTimeout); observers.forEach((o) => o.disconnect()) }
  }, [pathname])

  return (
    <>
      <div className="scroll-progress" ref={barRef} aria-hidden="true" />
      <button type="button" className="back-top" ref={topRef} aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>
        <svg viewBox="0 0 48 43.9" width="22" height="20" aria-hidden="true">
          <polygon points="0,0 20,0 20,29.9 0,43.9" fill="currentColor" />
          <polygon points="28,0 48,0 48,29.9 28,43.9" fill="currentColor" opacity=".55" />
        </svg>
      </button>
    </>
  )
}
