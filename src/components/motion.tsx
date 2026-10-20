'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))

/**
 * The site's quiet details: reveal-on-scroll, parallax, cursor ring, ice-crack clicks, magnetic buttons,
 * progress line, back-to-top. Everything is skipped for visitors who ask for reduced motion, and the
 * cursor effects only run with a real mouse. Without JS the page is simply the plain page.
 */
export function Motion() {
  const pathname = usePathname()
  const barRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLButtonElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)

  // Global behaviours (once)
  useEffect(() => {
    const root = document.documentElement
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const cleanups: Array<() => void> = []

    // A small hello for the curious
    console.log('%cBreaking Ice Productions', 'font:700 14px sans-serif;color:#c9773f', '\nCurious how it is built? Say hello and we will show you.')

    // Title nudge when the tab is hidden
    const title = document.title
    const onVis = () => { document.title = document.hidden ? 'Still here · Breaking Ice' : title }
    document.addEventListener('visibilitychange', onVis)
    cleanups.push(() => document.removeEventListener('visibilitychange', onVis))

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

    if (fine) {
      root.classList.add('motion-fine')
      let tx = -100, ty = -100, rx = -100, ry = -100, raf = 0, shown = false
      const ring = ringRef.current, dot = dotRef.current, label = labelRef.current
      const splash = () => document.querySelector<HTMLElement>('.splash')
      const loop = () => {
        rx += (tx - rx) * 0.18
        ry += (ty - ry) * 0.18
        if (ring) ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`
        if (dot) dot.style.transform = `translate3d(${tx}px, ${ty}px, 0) translate(-50%, -50%)`
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)

      const INTERACTIVE = 'a, button, [role="button"], summary, label, select, input[type="range"], input[type="checkbox"], input[type="radio"]'
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return
        tx = e.clientX; ty = e.clientY
        if (!shown) { shown = true; root.classList.add('cursor-on'); rx = tx; ry = ty }
        const t = e.target as Element | null
        const card = t?.closest('.card, .proj-card')
        const play = t?.closest('.reel-link')
        const hot = t?.closest(INTERACTIVE)
        const text = t?.closest('input:not([type]), input[type="text"], input[type="email"], input[type="tel"], textarea')
        const lab = play ? 'Play' : card ? 'View' : ''
        if (label && label.textContent !== lab) label.textContent = lab
        ring?.classList.toggle('big', !!(card || play))
        ring?.classList.toggle('hot', !!hot && !card && !play)
        ring?.classList.toggle('hide', !!text)
        const s = splash()
        if (s) { s.style.setProperty('--mx', String(((e.clientX / window.innerWidth) - 0.5) * 2)); s.style.setProperty('--my', String(((e.clientY / window.innerHeight) - 0.5) * 2)) }
        // magnetic buttons
        document.querySelectorAll<HTMLElement>('.btn, .back-top, .reel-link .ring').forEach((el) => {
          const r = el.getBoundingClientRect()
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2
          const dx = e.clientX - cx, dy = e.clientY - cy
          const reach = Math.max(r.width, r.height) * 0.9
          if (Math.hypot(dx, dy) < reach) el.style.translate = `${clamp(dx * 0.22, -9, 9)}px ${clamp(dy * 0.22, -7, 7)}px`
          else if (el.style.translate) el.style.translate = ''
        })
      }
      const onLeave = () => { shown = false; root.classList.remove('cursor-on') }

      // Ice cracks on click
      const crack = (x: number, y: number) => {
        const NS = 'http://www.w3.org/2000/svg'
        const svg = document.createElementNS(NS, 'svg')
        svg.setAttribute('class', 'crack')
        svg.setAttribute('width', '160'); svg.setAttribute('height', '160'); svg.setAttribute('viewBox', '-80 -80 160 160')
        svg.style.left = `${x}px`; svg.style.top = `${y}px`
        const n = 6 + Math.floor(Math.random() * 3)
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
          let px = 0, py = 0, d = 'M0 0'
          const segs = 2 + Math.floor(Math.random() * 2)
          for (let k = 0; k < segs; k++) {
            const len = 12 + Math.random() * 22, jit = (Math.random() - 0.5) * 0.7
            px += Math.cos(a + jit) * len; py += Math.sin(a + jit) * len
            d += `L${px.toFixed(1)} ${py.toFixed(1)}`
          }
          const p = document.createElementNS(NS, 'path')
          p.setAttribute('d', d); p.setAttribute('pathLength', '1')
          p.style.animationDelay = `${i * 12}ms`
          svg.appendChild(p)
        }
        document.body.appendChild(svg)
        window.setTimeout(() => svg.remove(), 1400)
      }
      const onDown = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return
        const t = e.target as Element | null
        if (t?.closest('input, textarea, select, [contenteditable], iframe, .lightbox')) return
        if (document.querySelectorAll('.crack').length > 6) return
        crack(e.clientX, e.clientY)
      }
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerdown', onDown)
      document.addEventListener('pointerleave', onLeave)
      cleanups.push(() => {
        cancelAnimationFrame(raf)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerdown', onDown)
        document.removeEventListener('pointerleave', onLeave)
        root.classList.remove('motion-fine', 'cursor-on')
      })
    }
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
      <div className="cursor-ring" ref={ringRef} aria-hidden="true"><span ref={labelRef} /></div>
      <div className="cursor-dot" ref={dotRef} aria-hidden="true" />
    </>
  )
}
