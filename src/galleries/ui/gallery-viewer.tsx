'use client'

/* eslint-disable @next/next/no-img-element -- photos are short-lived signed R2 addresses, not next/image material */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatBytes, type GalleryView, type GalleryViewer as Viewer, type PhotoSize, type PhotoView } from '../types'
import { longDate, plural } from './format'
import '../gallery.css'

/**
 * The client side of a photo gallery (our own Pixieset): cover, set tabs, a justified grid,
 * a lightbox, hearts and downloads. The same component serves the public share link, the
 * client portal and Josh's preview, so everything it may do comes from the GalleryView.
 */

type Props = { view: GalleryView }

const keyFromHash = () => {
  if (typeof window === 'undefined') return null
  const m = /^#p=([\w-]+)$/.exec(window.location.hash)
  return m ? m[1] : null
}

/* ── Justified rows ─────────────────────────────────────────────────────
   Photos keep their shape; each row is scaled to fill the width exactly (like Flickr).
   The last row keeps the target height so a lone photo isn't blown up. */

type Row = { items: PhotoView[]; height: number; full: boolean }

function layoutRows(photos: PhotoView[], width: number, target: number, gap: number): Row[] {
  const rows: Row[] = []
  let cur: PhotoView[] = []
  let sum = 0
  for (const p of photos) {
    const ratio = p.w > 0 && p.h > 0 ? Math.min(Math.max(p.w / p.h, 0.4), 4) : 1.5
    cur.push(p)
    sum += ratio
    const natural = sum * target + gap * (cur.length - 1)
    if (natural >= width) {
      rows.push({ items: cur, height: (width - gap * (cur.length - 1)) / sum, full: true })
      cur = []
      sum = 0
    }
  }
  if (cur.length) rows.push({ items: cur, height: Math.min(target, (width - gap * (cur.length - 1)) / sum), full: false })
  return rows
}

const ratioOf = (p: PhotoView) => (p.w > 0 && p.h > 0 ? Math.min(Math.max(p.w / p.h, 0.4), 4) : 1.5)

/** How many rows to put in the page at once; more are added as you scroll. Keeps 1,000+ photo galleries quick. */
const ROW_CHUNK = 24

/* ── Icons (inline, decorative) ─────────────────────────────────────── */

const Heart = ({ on }: { on?: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.5 3.3 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
)
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const Close = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
const CHEVRONS = { left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', down: 'M5 9l7 7 7-7' }
const Chevron = ({ dir }: { dir: keyof typeof CHEVRONS }) => (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
    <path d={CHEVRONS[dir]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* ── The gallery ────────────────────────────────────────────────────── */

export function GalleryViewer({ view }: Props) {
  const [viewer, setViewer] = useState<Viewer>(view.viewer)
  const [favs, setFavs] = useState<Set<string>>(() => new Set(view.favourites))
  const [tab, setTab] = useState<string>('all')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [askName, setAskName] = useState<string | null>(null)
  const [zipOpen, setZipOpen] = useState(false)
  const pushed = useRef(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Hearts: anyone who can save them, plus share guests (asked for a name first). Never previews or admin.
  const showHearts = view.via !== 'admin' && (viewer.canFavourite || viewer.kind === 'guest')
  const sizes = (['full', 'web'] as const).filter((s) => view.downloads[s])
  const canZip = view.downloads.all && sizes.length > 0 && view.photos.length > 0

  const byKey = useMemo(() => new Map(view.photos.map((p) => [p.key, p])), [view.photos])
  const shown = useMemo(() => {
    if (tab === 'all') return view.photos
    if (tab === 'favourites') return view.photos.filter((p) => favs.has(p.key))
    return view.photos.filter((p) => p.set === tab)
  }, [tab, view.photos, favs])

  const say = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 4000)
  }, [])

  /* Lightbox ↔ URL: #p=<key> links straight to a photo, and the back button closes it. */
  useEffect(() => {
    const sync = () => {
      const k = keyFromHash()
      setOpenKey(k && byKey.has(k) ? k : null)
      if (!k) pushed.current = false
    }
    sync()
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [byKey])

  const open = useCallback((key: string) => {
    window.history.pushState(null, '', `#p=${key}`)
    pushed.current = true
    setOpenKey(key)
  }, [])
  const go = useCallback((key: string) => {
    window.history.replaceState(null, '', `#p=${key}`)
    setOpenKey(key)
  }, [])
  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setOpenKey(null)
  }, [])

  /* Favourites: optimistic, rolled back if the save fails. */
  const sendFav = useCallback(
    async (key: string, on: boolean) => {
      setFavs((s) => {
        const n = new Set(s)
        if (on) n.add(key)
        else n.delete(key)
        return n
      })
      const undo = () =>
        setFavs((s) => {
          const n = new Set(s)
          if (on) n.delete(key)
          else n.add(key)
          return n
        })
      try {
        const res = await fetch('/api/galleries/fav', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ via: view.via, ref: view.ref, key, on }) })
        if (res.ok) return
        undo()
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        if (err.error === 'name-needed') setAskName(key)
        else say('That favourite didn’t save. Please try again.')
      } catch {
        undo()
        say('That favourite didn’t save. Check your connection and try again.')
      }
    },
    [view.via, view.ref, say],
  )

  const toggleFav = useCallback(
    (key: string) => {
      if (!viewer.canFavourite) {
        if (viewer.kind === 'guest') setAskName(key)
        return
      }
      void sendFav(key, !favs.has(key))
    },
    [viewer, favs, sendFav],
  )

  const lightboxList = openKey && shown.some((p) => p.key === openKey) ? shown : view.photos
  const openPhoto = openKey ? byKey.get(openKey) ?? null : null

  const downloadHref = (key: string, size: PhotoSize) => `/api/galleries/download?${new URLSearchParams({ via: view.via, ref: view.ref, key, size })}`

  return (
    <div className="gv">
      {view.sample && (
        <p className="gv-sample" role="note">
          <strong>Sample gallery:</strong> made-up photos, so you can see how a gallery works. Nothing here is a real shoot.
        </p>
      )}

      <Hero view={view} />

      <div className="gv-bar" id="gallery">
        <div className="gv-bar-in">
          <div className="gv-tabs" role="toolbar" aria-label="Show photos">
            {(view.sets.length > 1 || showHearts) && (
              <TabButton current={tab === 'all'} onClick={() => setTab('all')} label="All" count={view.photos.length} />
            )}
            {view.sets.length > 1 && view.sets.map((s) => <TabButton key={s._key} current={tab === s._key} onClick={() => setTab(s._key)} label={s.title} count={view.photos.filter((p) => p.set === s._key).length} />)}
            {showHearts && (
              <TabButton current={tab === 'favourites'} onClick={() => setTab('favourites')} label="Favourites" count={favs.size} heart />
            )}
            {view.sets.length <= 1 && !showHearts && <span className="gv-count">{plural(view.photos.length, 'photo')}</span>}
          </div>
          {canZip && (
            <button type="button" className="gv-action" onClick={() => setZipOpen(true)}>
              <DownloadIcon />
              <span>Download all</span>
            </button>
          )}
        </div>
      </div>

      <section className="gv-grid-wrap" aria-label="Photos">
        {shown.length ? (
          <JustifiedGrid key={tab} photos={shown} favs={favs} showHearts={showHearts} onOpen={open} onHeart={toggleFav} />
        ) : tab === 'favourites' ? (
          <div className="gv-empty">
            <span className="gv-empty-heart" aria-hidden="true"><Heart /></span>
            <h2>No favourites yet</h2>
            <p>Tap the heart on any photo to keep it here. It’s a handy way to tell us which ones you love.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTab('all')}>See all photos</button>
          </div>
        ) : (
          <div className="gv-empty">
            <h2>No photos here yet</h2>
            <p>Check back soon.</p>
          </div>
        )}
      </section>

      {openPhoto && (
        <Lightbox
          photo={openPhoto}
          list={lightboxList}
          fav={favs.has(openPhoto.key)}
          showHeart={showHearts}
          sizes={sizes}
          downloadHref={downloadHref}
          onHeart={() => toggleFav(openPhoto.key)}
          onGo={go}
          onClose={close}
        />
      )}

      {askName && view.via === 'share' && (
        <GuestDialog
          slug={view.ref}
          onCancel={() => setAskName(null)}
          onSaved={(v) => {
            const key = askName
            setViewer(v)
            setAskName(null)
            void sendFav(key, true)
            say(`Thanks, ${v.name}. Your favourites will be saved.`)
          }}
        />
      )}

      {zipOpen && <ZipDialog view={view} sizes={sizes} favCount={viewer.canFavourite ? favs.size : 0} onClose={() => setZipOpen(false)} />}

      <div className="gv-toast" role="status" aria-live="polite">
        {toast && <span>{toast}</span>}
      </div>
    </div>
  )
}

function TabButton({ current, onClick, label, count, heart }: { current: boolean; onClick: () => void; label: string; count: number; heart?: boolean }) {
  return (
    <button type="button" className="gv-tab" aria-pressed={current} onClick={onClick}>
      {heart && <Heart on={count > 0} />}
      <span>{label}</span>
      <span className="gv-tab-n">{count.toLocaleString('en-CA')}</span>
    </button>
  )
}

/* ── Hero ───────────────────────────────────────────────────────────── */

function Hero({ view }: { view: GalleryView }) {
  const date = longDate(view.date)
  const until = longDate(view.expiresOn)
  const meta = [view.org, date, plural(view.photos.length, 'photo')].filter(Boolean)
  const scrollToGrid = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById('gallery')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }
  const text = (
    <div className="gv-hero-text">
      <p className="gv-hero-meta">{meta.join(' · ')}</p>
      <h1 className="gv-title">{view.title}</h1>
      {view.message && <p className="gv-message">{view.message}</p>}
      {until && <p className="gv-until">Open until {until}</p>}
      <button type="button" className="gv-cue" onClick={scrollToGrid}>
        <span>View gallery</span>
        <Chevron dir="down" />
      </button>
    </div>
  )
  if (!view.cover) return <header className="gv-hero gv-hero-plain">{text}</header>
  return (
    <header className="gv-hero">
      <img className="gv-hero-img" src={view.cover.web} alt="" width={view.cover.w} height={view.cover.h} fetchPriority="high" decoding="async" style={{ backgroundImage: `url("${view.cover.thumb}")` }} />
      <div className="gv-hero-shade" aria-hidden="true" />
      {text}
    </header>
  )
}

/* ── Grid ───────────────────────────────────────────────────────────── */

function JustifiedGrid({ photos, favs, showHearts, onOpen, onHeart }: { photos: PhotoView[]; favs: Set<string>; showHearts: boolean; onOpen: (k: string) => void; onHeart: (k: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [limit, setLimit] = useState(ROW_CHUNK)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const target = width < 560 ? 180 : width < 900 ? 240 : 320
  const gap = width < 560 ? 6 : 10
  const rows = useMemo(() => (width ? layoutRows(photos, width, target, gap) : []), [photos, width, target, gap])

  useEffect(() => {
    const el = sentinel.current
    if (!el || limit >= rows.length) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setLimit((l) => l + ROW_CHUNK), { rootMargin: '1200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [limit, rows.length])

  // Space for rows not yet in the page, so the scrollbar is honest and nothing jumps.
  const rest = rows.slice(limit).reduce((n, r) => n + r.height + gap, 0)

  return (
    <div className="gv-grid" ref={ref} style={{ ['--gv-gap' as string]: `${gap}px` }}>
      {!width && <div className="gv-grid-wait" aria-hidden="true" />}
      {rows.slice(0, limit).map((row, i) => (
        <div className="gv-row" key={`${i}-${row.items[0].key}`} style={{ height: row.height, containIntrinsicSize: `auto ${Math.round(row.height)}px` }}>
          {row.items.map((p) => {
            const w = ratioOf(p) * row.height
            return (
              <div key={p.key} className={`gv-tile${favs.has(p.key) ? ' is-fav' : ''}`} style={row.full ? { flex: `${ratioOf(p)} 1 0px` } : { flex: `0 0 ${w}px` }}>
                <button type="button" className="gv-open" onClick={() => onOpen(p.key)} aria-label={`Open ${p.name}`}>
                  <img src={p.thumb} alt="" loading="lazy" decoding="async" width={p.w} height={p.h} />
                </button>
                {showHearts && (
                  <button type="button" className="gv-heart" aria-pressed={favs.has(p.key)} aria-label={favs.has(p.key) ? `Remove ${p.name} from favourites` : `Add ${p.name} to favourites`} onClick={() => onHeart(p.key)}>
                    <Heart on={favs.has(p.key)} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
      {limit < rows.length && <div ref={sentinel} className="gv-rest" style={{ height: rest }} aria-hidden="true" />}
    </div>
  )
}

/* ── Lightbox ───────────────────────────────────────────────────────── */

function Lightbox({ photo, list, fav, showHeart, sizes, downloadHref, onHeart, onGo, onClose }: {
  photo: PhotoView
  list: PhotoView[]
  fav: boolean
  showHeart: boolean
  sizes: readonly PhotoSize[]
  downloadHref: (key: string, size: PhotoSize) => string
  onHeart: () => void
  onGo: (key: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnTo = useRef<Element | null>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const [loaded, setLoaded] = useState<string | null>(null)
  const i = Math.max(0, list.findIndex((p) => p.key === photo.key))
  const prev = list.length > 1 ? list[(i - 1 + list.length) % list.length] : null
  const next = list.length > 1 ? list[(i + 1) % list.length] : null

  // A modal <dialog>: the browser keeps focus inside, makes the page behind inert and handles Esc.
  useEffect(() => {
    const d = ref.current
    returnTo.current = document.activeElement
    if (d && !d.open) d.showModal()
    const html = document.documentElement
    const was = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = was
      const back = returnTo.current
      if (back instanceof HTMLElement && document.contains(back)) back.focus({ preventScroll: true })
    }
  }, [])

  // Neighbours load in the background, so the next photo is already there.
  useEffect(() => {
    for (const p of [next, prev]) if (p) new Image().src = p.web
  }, [next, prev])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' && next) {
      e.preventDefault()
      onGo(next.key)
    } else if (e.key === 'ArrowLeft' && prev) {
      e.preventDefault()
      onGo(prev.key)
    }
  }

  return (
    <dialog
      ref={ref}
      className="gv-lb"
      aria-label={`${photo.name}, photo ${i + 1} of ${list.length}`}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        onClose()
      }}
      onKeyDown={onKey}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current
        touch.current = null
        if (!t) return
        const dx = e.changedTouches[0].clientX - t.x
        const dy = e.changedTouches[0].clientY - t.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          const to = dx < 0 ? next : prev
          if (to) onGo(to.key)
        } else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) onClose()
      }}
    >
      <div className="gv-lb-top">
        <p className="gv-lb-name">
          <span className="gv-lb-file">{photo.name}</span>
          <span className="gv-lb-n">{i + 1} / {list.length}</span>
        </p>
        <div className="gv-lb-actions">
          {showHeart && (
            <button type="button" className={`gv-lb-btn${fav ? ' is-fav' : ''}`} aria-pressed={fav} aria-label={fav ? 'Remove from favourites' : 'Add to favourites'} onClick={onHeart}>
              <Heart on={fav} />
            </button>
          )}
          {sizes.map((s) => (
            <a key={s} className="gv-lb-btn gv-lb-dl" href={downloadHref(photo.key, s)} download aria-label={s === 'full' ? `Download ${photo.name}, full size` : `Download ${photo.name}, web size`}>
              <DownloadIcon />
              <span className="gv-lb-dl-label">{sizes.length > 1 ? (s === 'full' ? 'Full size' : 'Web size') : 'Download'}</span>
            </a>
          ))}
          <button type="button" className="gv-lb-btn" aria-label="Close" onClick={onClose} autoFocus>
            <Close />
          </button>
        </div>
      </div>

      <div className="gv-lb-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="gv-lb-frame">
          <img className="gv-lb-thumb" src={photo.thumb} alt="" aria-hidden="true" />
          <img key={photo.key} className={`gv-lb-img${loaded === photo.key ? ' is-in' : ''}`} src={photo.web} alt={photo.name} onLoad={() => setLoaded(photo.key)} decoding="async" />
        </div>
      </div>

      {prev && (
        <button type="button" className="gv-lb-nav gv-lb-prev" aria-label="Previous photo" onClick={() => onGo(prev.key)}>
          <Chevron dir="left" />
        </button>
      )}
      {next && (
        <button type="button" className="gv-lb-nav gv-lb-next" aria-label="Next photo" onClick={() => onGo(next.key)}>
          <Chevron dir="right" />
        </button>
      )}
    </dialog>
  )
}

/* ── Small dialogs ──────────────────────────────────────────────────── */

/** A modal <dialog> that opens itself and reports Esc / backdrop clicks as cancel. */
function Modal({ label, onCancel, children }: { label: string; onCancel: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    const back = document.activeElement
    if (d && !d.open) d.showModal()
    return () => {
      if (back instanceof HTMLElement && document.contains(back)) back.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="gv-modal"
      aria-label={label}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        onCancel()
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="gv-modal-in">{children}</div>
    </dialog>
  )
}

function GuestDialog({ slug, onCancel, onSaved }: { slug: string; onCancel: () => void; onSaved: (v: Viewer) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Please add your name.')
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/galleries/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, name, email }) })
      const data = (await res.json().catch(() => ({}))) as { viewer?: Viewer; error?: string }
      if (!res.ok || !data.viewer) throw new Error(data.error || 'failed')
      onSaved(data.viewer)
    } catch {
      setError('That didn’t work. Please try again in a moment.')
      setBusy(false)
    }
  }

  return (
    <Modal label="Save your favourites" onCancel={onCancel}>
      <form onSubmit={submit} className="gv-form" noValidate>
        <h2 className="gv-modal-h">Save your favourites</h2>
        <p className="gv-modal-p">Add your name so we know whose picks these are. Your favourites stay on this device and with us.</p>
        <div className="field">
          <label htmlFor="gv-guest-name">Your name</label>
          <input id="gv-guest-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} required aria-invalid={Boolean(error && !name.trim())} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="gv-guest-email">Email <span className="muted">(optional)</span></label>
          <input id="gv-guest-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={120} />
        </div>
        {error && <p className="gv-error" role="alert">{error}</p>}
        <div className="gv-modal-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Not now</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save and add heart'}</button>
        </div>
      </form>
    </Modal>
  )
}

type Part = { part: number; count: number; bytes: number }

function ZipDialog({ view, sizes, favCount, onClose }: { view: GalleryView; sizes: readonly PhotoSize[]; favCount: number; onClose: () => void }) {
  const [scope, setScope] = useState('all')
  const [size, setSize] = useState<PhotoSize>(sizes[0])
  const [parts, setParts] = useState<Part[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const scopes = [
    { value: 'all', label: 'Whole gallery', count: view.photos.length },
    ...(view.sets.length > 1 ? view.sets.map((s) => ({ value: s._key, label: s.title, count: view.photos.filter((p) => p.set === s._key).length })) : []),
    ...(favCount ? [{ value: 'favourites', label: 'My favourites', count: favCount }] : []),
  ]
  const q = (extra: Record<string, string>) => `/api/galleries/zip?${new URLSearchParams({ via: view.via, ref: view.ref, scope, size, ...extra })}`

  const prepare = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch(q({ plan: '1' }), { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { parts?: Part[] }
      if (!res.ok || !data.parts) throw new Error()
      if (!data.parts.length) setError('There are no photos in that selection.')
      else setParts(data.parts)
    } catch {
      setError('We couldn’t get that ready. Please try again in a moment.')
    }
    setBusy(false)
  }

  const scopeLabel = scopes.find((s) => s.value === scope)?.label ?? ''

  return (
    <Modal label="Download photos" onCancel={onClose}>
      {parts ? (
        <div className="gv-form">
          <h2 className="gv-modal-h">Ready to download</h2>
          <p className="gv-modal-p">
            {scopeLabel}, {size === 'full' ? 'full size' : 'web size'}.{' '}
            {parts.length > 1 ? `It comes in ${parts.length} parts so each one downloads reliably. Download each part and unzip them into the same folder.` : 'One zip file.'}
          </p>
          <ul className="gv-parts">
            {parts.map((p) => (
              <li key={p.part}>
                <a className="gv-part" href={q({ part: String(p.part) })} download>
                  <DownloadIcon />
                  <span className="gv-part-label">{parts.length > 1 ? `Part ${p.part} of ${parts.length}` : 'Download zip'}</span>
                  <span className="gv-part-meta">{plural(p.count, 'photo')} · {formatBytes(p.bytes)}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="gv-hint">Large downloads can take a while. Keep this page open until they finish.</p>
          <div className="gv-modal-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setParts(null)}>Back</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <form className="gv-form" onSubmit={prepare}>
          <h2 className="gv-modal-h">Download photos</h2>
          <fieldset className="gv-choices">
            <legend>Which photos</legend>
            {scopes.map((s) => (
              <label key={s.value} className="gv-choice">
                <input type="radio" name="gv-scope" value={s.value} checked={scope === s.value} onChange={() => setScope(s.value)} />
                <span>{s.label}</span>
                <span className="gv-choice-meta">{plural(s.count, 'photo')}</span>
              </label>
            ))}
          </fieldset>
          {sizes.length > 1 && (
            <fieldset className="gv-choices">
              <legend>Size</legend>
              <label className="gv-choice">
                <input type="radio" name="gv-size" value="full" checked={size === 'full'} onChange={() => setSize('full')} />
                <span>Full size</span>
                <span className="gv-choice-meta">{scope === 'all' ? formatBytes(view.totals.full) : 'Best for printing'}</span>
              </label>
              <label className="gv-choice">
                <input type="radio" name="gv-size" value="web" checked={size === 'web'} onChange={() => setSize('web')} />
                <span>Web size</span>
                <span className="gv-choice-meta">{scope === 'all' ? formatBytes(view.totals.web) : 'For email, web and social'}</span>
              </label>
            </fieldset>
          )}
          {error && <p className="gv-error" role="alert">{error}</p>}
          <div className="gv-modal-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Getting it ready…' : 'Continue'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
