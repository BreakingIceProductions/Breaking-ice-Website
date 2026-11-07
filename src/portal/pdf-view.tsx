'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * Our own PDF viewer: pages drawn with pdf.js on navy, one page per frame, snapping as
 * you scroll or swipe. No browser toolbar, and it works on phones too.
 */

const docs = new Map<string, Promise<PDFDocumentProxy>>()

/** One load per file, shared by the reveal's cover and the viewer. */
export function loadPdf(url: string) {
  let p = docs.get(url)
  if (!p) {
    p = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
      return pdfjs.getDocument({ url, withCredentials: true }).promise
    })
    p.catch(() => docs.delete(url))
    docs.set(url, p)
  }
  return p
}

/** Draws a page into a canvas, fitted inside w × h CSS pixels. */
export async function drawPage(doc: PDFDocumentProxy, n: number, canvas: HTMLCanvasElement, w: number, h: number) {
  const page = await doc.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(w / base.width, h / base.height)
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  const vp = page.getViewport({ scale: scale * ratio })
  canvas.width = Math.floor(vp.width)
  canvas.height = Math.floor(vp.height)
  canvas.style.width = `${Math.floor(vp.width / ratio)}px`
  canvas.style.height = `${Math.floor(vp.height / ratio)}px`
  await page.render({ canvas, viewport: vp }).promise
}

export function PdfPages({ url, title }: { url: string; title: string }) {
  const frame = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [failed, setFailed] = useState(false)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [current, setCurrent] = useState(1)

  useEffect(() => {
    let live = true
    loadPdf(url).then(
      (d) => live && setDoc(d),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [url])

  // The frame is as tall as one page at the available width, up to most of the screen.
  useEffect(() => {
    if (!doc || !frame.current) return
    const el = frame.current
    let ratio = 1.294
    doc.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 })
      ratio = v.height / v.width
      fit()
    })
    const fit = () => {
      const w = el.clientWidth
      setSize({ w, h: Math.round(Math.min(w * ratio, window.innerHeight * 0.82)) })
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc])

  const go = useCallback((n: number) => {
    const el = frame.current
    if (!el || !doc) return
    const to = Math.max(1, Math.min(doc.numPages, n))
    el.scrollTo({ top: (to - 1) * el.clientHeight, behavior: 'smooth' })
  }, [doc])

  const onScroll = () => {
    const el = frame.current
    if (el) setCurrent(Math.round(el.scrollTop / el.clientHeight) + 1)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault()
      go(current + 1)
    } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault()
      go(current - 1)
    }
  }

  if (failed) return <div className="pdfv pdfv-msg"><p className="muted">The quote couldn’t be shown here. Use Open the PDF below.</p></div>

  return (
    <div className="pdfv">
      <div
        ref={frame}
        className="pdfv-frame"
        style={size ? { height: size.h } : undefined}
        onScroll={onScroll}
        onKeyDown={onKey}
        tabIndex={0}
        role="region"
        aria-roledescription="document viewer"
        aria-label={`${title}, page ${current} of ${doc?.numPages ?? '…'}. Use the arrow keys to turn pages.`}
      >
        {doc && size
          ? Array.from({ length: doc.numPages }, (_, i) => <Page key={i} doc={doc} n={i + 1} w={size.w} h={size.h} />)
          : <div className="pdfv-page"><span className="pdfv-loading" aria-hidden="true" /></div>}
      </div>
      {doc && doc.numPages > 1 && (
        <div className="pdfv-bar">
          <button type="button" className="pdfv-btn" onClick={() => go(current - 1)} disabled={current <= 1} aria-label="Previous page">‹</button>
          <span className="pdfv-count" aria-live="polite">{current} / {doc.numPages}</span>
          <button type="button" className="pdfv-btn" onClick={() => go(current + 1)} disabled={current >= doc.numPages} aria-label="Next page">›</button>
        </div>
      )}
    </div>
  )
}

/** A page draws once it's near the screen. */
function Page({ doc, n, w, h }: { doc: PDFDocumentProxy; n: number; w: number; h: number }) {
  const slot = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(n <= 2)

  useEffect(() => {
    if (near || !slot.current) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: '150% 0px' })
    io.observe(slot.current)
    return () => io.disconnect()
  }, [near])

  useEffect(() => {
    if (near && canvas.current) drawPage(doc, n, canvas.current, w - 24, h - 24).catch(() => {})
  }, [near, doc, n, w, h])

  return (
    <div ref={slot} className="pdfv-page" style={{ height: h }}>
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  )
}
