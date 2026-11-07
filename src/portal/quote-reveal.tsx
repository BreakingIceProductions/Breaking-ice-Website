'use client'

import { useEffect, useRef, useState } from 'react'
import { Mark } from '@/components/brand'
import { drawPage, loadPdf } from './pdf-view'

type Props = {
  /** Remembered per quote version, so a new version plays it again. */
  seenKey: string
  pdfUrl?: string
  /** The cover as an image: shown at once. Without it, the PDF's first page is drawn. */
  coverUrl?: string
  title: string
  org: string
  firstName?: string
  price?: string
  note?: string
  from?: { name: string; photo?: string }
}

const seen = (k: string) => {
  try {
    return localStorage.getItem(k) === '1'
  } catch {
    return false
  }
}

/**
 * The first time someone opens a quote: the page dims, the mark appears, and the cover
 * of their quote rises into view with who it's for and the price. One button opens it.
 */
export function QuoteReveal({ seenKey, pdfUrl, coverUrl, title, org, firstName, price, note, from }: Props) {
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const cover = useRef<HTMLCanvasElement>(null)
  const go = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const forced = new URLSearchParams(location.search).has('reveal')
    if (forced || !seen(seenKey)) setOpen(true)
    const replay = () => {
      setLeaving(false)
      setOpen(true)
    }
    window.addEventListener('quote-reveal', replay)
    return () => window.removeEventListener('quote-reveal', replay)
  }, [seenKey])

  useEffect(() => {
    if (!open) return
    document.documentElement.style.overflow = 'hidden'
    // The button takes focus once it has appeared.
    const t = setTimeout(() => go.current?.focus({ preventScroll: true }), 2300)
    if (!coverUrl && pdfUrl && cover.current) {
      const c = cover.current
      loadPdf(pdfUrl).then((d) => drawPage(d, 1, c, 300, 390)).then(() => c.classList.add('ready')).catch(() => {})
    }
    return () => {
      clearTimeout(t)
      document.documentElement.style.overflow = ''
    }
  }, [open, pdfUrl, coverUrl])

  const close = () => {
    try {
      localStorage.setItem(seenKey, '1')
    } catch {}
    setLeaving(true)
    setTimeout(() => setOpen(false), 450)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close()
    // Keep focus inside while it's open.
    if (e.key === 'Tab' && box.current) {
      const f = [...box.current.querySelectorAll<HTMLElement>('button')]
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  if (!open) return null

  return (
    <div ref={box} className={`qr${leaving ? ' qr-out' : ''}`} role="dialog" aria-modal="true" aria-labelledby="qr-title" onKeyDown={onKey}>
      <button type="button" className="qr-skip" onClick={close}>Skip</button>
      <div className="qr-stage">
        <Mark className="qr-mark" />
        <div className="qr-doc">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="qr-cover" onLoad={(e) => e.currentTarget.classList.add('ready')} ref={(el) => { if (el?.complete && el.naturalWidth) el.classList.add('ready') }} />
          ) : (
            <canvas ref={cover} className="qr-cover" aria-hidden="true" />
          )}
          <span className="qr-cover-blank" aria-hidden="true" />
        </div>
        <div className="qr-text">
          <span className="qr-eyebrow">Prepared for {firstName ? `${firstName} · ` : ''}{org}</span>
          <h2 id="qr-title" className="qr-title">{title}</h2>
          {price && <p className="qr-price">{price}</p>}
          {note && (
            <figure className="qr-note">
              <blockquote>{note}</blockquote>
              {from && (
                <figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {from.photo ? <img src={from.photo} alt="" /> : <span className="qr-initials" aria-hidden="true">{from.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>}
                  {from.name}
                </figcaption>
              )}
            </figure>
          )}
          <button ref={go} type="button" className="btn btn-primary qr-go" onClick={close}>Open your quote</button>
        </div>
      </div>
    </div>
  )
}

/** "Replay" on the quote page. */
export function ReplayReveal() {
  return (
    <button type="button" className="linklike small" onClick={() => window.dispatchEvent(new Event('quote-reveal'))}>
      Replay the welcome
    </button>
  )
}
