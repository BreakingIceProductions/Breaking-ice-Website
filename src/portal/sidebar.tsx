'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export type NavProject = {
  slug: string
  title: string
  /** Client-facing stage: Booked, In edit, Delivered… */
  stage: string
  done: boolean
  /** Versions waiting on their feedback. */
  waiting: number
  delivered: boolean
  billing: boolean
}
export type NavQuote = { slug: string; title: string; signed: boolean }
export type NavProducer = { name: string; role?: string; email?: string; phone?: string; photo?: string }

type Props = { projects: NavProject[]; quotes: NavQuote[]; waiting: number; producer?: NavProducer }

/**
 * The portal's map: Home, Quotes, each project and its sections, and who to ask.
 * A column on wide screens; on phones, a Menu button slides the same list in.
 */
export function PortalSidebar({ projects, quotes, waiting, producer }: Props) {
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const [hash, setHash] = useState('')

  // Close the drawer whenever they go somewhere.
  useEffect(() => setOpen(false), [pathname, params])
  useEffect(() => {
    const read = () => setHash(location.hash)
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [pathname])
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  const toSign = quotes.filter((q) => !q.signed).length
  const current = projects.find((p) => pathname === `/portal/${p.slug}`)
  const at = params.get('at')?.split('/')[0] ?? ''
  const live = projects.filter((p) => !p.done)
  const past = projects.filter((p) => p.done)
  const here = current ? (at ? `?at=${at}` : hash || '#overview') : ''

  const project = (p: NavProject) => {
    const on = current?.slug === p.slug
    const base = `/portal/${p.slug}`
    const section = (href: string, label: string, key: string, badge?: number) => {
      const active = on && here === key
      return (
        <li key={key}>
          <Link href={`${base}${href}`} className={`ps-sub${active ? ' on' : ''}`} aria-current={active ? 'location' : undefined} onClick={() => href.startsWith('#') && setHash(href)}>
            {label}
            {badge ? <span className="ps-badge" aria-label={`${badge} waiting`}>{badge}</span> : null}
          </Link>
        </li>
      )
    }
    return (
      <li key={p.slug}>
        <Link href={base} className={`ps-proj${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
          <span className="ps-proj-title">{p.title}</span>
          <span className="ps-tag">{p.stage}</span>
          {!on && p.waiting ? <span className="ps-dot" aria-label={`${p.waiting} waiting for you`} /> : null}
        </Link>
        {on && (
          <ul className="ps-subs" aria-label={`${p.title} sections`}>
            {section('#overview', 'Overview', '#overview')}
            {section('?at=videos#work', 'Videos', '?at=videos', p.waiting)}
            {section('?at=documents#work', 'Documents', '?at=documents')}
            {section('?at=assets#work', 'Share files', '?at=assets')}
            {p.delivered && section('?at=finals#work', 'Final files', '?at=finals')}
            {p.billing && section('#billing', 'Billing', '#billing')}
          </ul>
        )}
      </li>
    )
  }

  const initials = producer?.name.split(' ').map((w) => w[0]).join('').slice(0, 2)

  return (
    <>
      <div className="ps-bar">
        <button type="button" className="ps-menu" aria-expanded={open} aria-controls="portal-nav" onClick={() => setOpen(true)}>
          <span className="ps-burger" aria-hidden="true"><i /><i /><i /></span>
          Menu
          {toSign + waiting > 0 && <span className="ps-badge">{toSign + waiting}</span>}
        </button>
        <span className="ps-bar-where">{current?.title ?? (pathname.startsWith('/portal/quotes') ? 'Quotes' : 'Home')}</span>
      </div>
      {open && <div className="ps-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside id="portal-nav" className={`ps${open ? ' open' : ''}`} aria-label="Client portal">
        <button type="button" className="ps-close" onClick={() => setOpen(false)}>Close<span className="sr-only"> menu</span></button>
        <nav className="ps-nav" aria-label="Portal sections">
          <ul className="ps-top">
            <li>
              <Link href="/portal" className={`ps-link${pathname === '/portal' ? ' on' : ''}`} aria-current={pathname === '/portal' ? 'page' : undefined}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 9.5 10 3l7 6.5V17h-4.5v-4.5h-5V17H3z" /></svg>
                Home
                {waiting + toSign > 0 && <span className="ps-badge" aria-label={`${waiting + toSign} waiting for you`}>{waiting + toSign}</span>}
              </Link>
            </li>
            {quotes.length > 0 && (
              <li>
                <Link href="/portal/quotes" className={`ps-link${pathname.startsWith('/portal/quotes') ? ' on' : ''}`} aria-current={pathname.startsWith('/portal/quotes') ? 'page' : undefined}>
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.5h7l3.5 3.5v11.5H5zM12 2.5V6h3.5M7.5 10h5M7.5 13h5" /></svg>
                  Quotes
                  {toSign > 0 && <span className="ps-dot" aria-label="Waiting for your signature" />}
                </Link>
              </li>
            )}
          </ul>

          {live.length > 0 && (
            <>
              <h2 className="ps-head">Projects</h2>
              <ul className="ps-projects">{live.map(project)}</ul>
            </>
          )}
          {past.length > 0 && (
            <details className="ps-past" open={past.some((p) => p.slug === current?.slug)}>
              <summary className="ps-head">Past projects <span className="muted">({past.length})</span></summary>
              <ul className="ps-projects">{past.map(project)}</ul>
            </details>
          )}
        </nav>

        <div className="ps-foot">
          {producer?.name && (
            <div className="ps-producer">
              <span className="ps-head">Your producer</span>
              <div className="ps-who">
                {producer.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={producer.photo} alt="" width={40} height={40} />
                ) : (
                  <span className="avatar" aria-hidden="true">{initials}</span>
                )}
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <strong>{producer.name}</strong>
                  {producer.role && <span className="muted small">{producer.role}</span>}
                </span>
              </div>
              {producer.email && <a className="text-link small" href={`mailto:${producer.email}`}>{producer.email}</a>}
              {producer.phone && <a className="text-link small" href={`tel:${producer.phone.replace(/[^\d+]/g, '')}`}>{producer.phone}</a>}
            </div>
          )}
          <div className="ps-out">
            <a href="/" target="_blank" rel="noopener">Website ↗</a>
          </div>
        </div>
      </aside>
    </>
  )
}
