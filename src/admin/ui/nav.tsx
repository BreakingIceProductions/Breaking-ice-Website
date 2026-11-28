'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useSideCollapsed } from './side-toggle'

const ICONS: Record<string, React.ReactNode> = {
  dash: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  // A funnel: everyone who got in touch, narrowing to the ones who sign.
  leads: <path d="M3 4h18l-7 8.5V19l-4 2v-8.5Z" />,
  projects: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>,
  clients: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  // An envelope: client email.
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  proposals: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  portals: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  money: <><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>,
  // A month with a repeat arrow: work that comes round every month.
  retainers: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M15 15.5a3 3 0 1 1-1-2.2M15 12.5v1.8h-1.8" /></>,
  // A photo: frame, sun, hills.
  galleries: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5L5 20" /></>,
  // A folder: each client's projects and files.
  finder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>,
  // Two books standing and one leaning.
  library: <><path d="M4 4h3.5v16H4zM10 4h3.5v16H10z" /><path d="m15.6 5.2 3.1-.8 3.8 14.6-3.1.8z" /></>,
  studio: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></>,
}

const Icon = ({ name }: { name: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
)

/** A small pulse on the link that was just clicked, until the next page arrives (must sit inside the Link). */
function Pending() {
  const { pending } = useLinkStatus()
  return <span className={`a-nav-pending${pending ? ' on' : ''}`} aria-hidden="true" />
}

type Item = { href: string; label: string; icon: string; on?: boolean; count?: number; /** What the badge counts, read out after the number. */ countLabel?: string; /** Opens in a new tab; the note is read out after the label. */ external?: string }

/**
 * Unread client email for the Emails badge. One request shared by both copies of the menu, at most once a
 * minute (the server keeps its own short cache, so this never walks the mailbox).
 */
let unreadAsk: { at: number; p: Promise<number> } | null = null
function askUnread() {
  if (!unreadAsk || Date.now() - unreadAsk.at > 60_000)
    unreadAsk = {
      at: Date.now(),
      p: fetch('/api/admin/emails?count=1')
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((j: { count?: number }) => Math.max(0, Number(j.count) || 0))
        .catch(() => 0),
    }
  return unreadAsk.p
}

function useUnreadMail() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    const load = () => void askUnread().then((v) => live && setN(v))
    load()
    // Opening a conversation marks it read: the page says how many.
    const read = (e: Event) => {
      setN((x) => Math.max(0, x + Number((e as CustomEvent<number>).detail || 0)))
      unreadAsk = null
    }
    const focus = () => document.visibilityState === 'visible' && load()
    window.addEventListener('a-emails-read', read)
    document.addEventListener('visibilitychange', focus)
    return () => {
      live = false
      window.removeEventListener('a-emails-read', read)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [])
  return n
}

/** The menu. `id` keeps label ids unique when it's rendered twice (sidebar and the phone menu sheet). */
export function AdminNav({ needs: initial = 0, id = 'a-nav' }: { needs?: number; id?: string }) {
  const path = usePathname()
  // The badge follows Dismiss / Undo on Today (the rows announce them), like the page's own count.
  const [delta, setDelta] = useState(0)
  useEffect(() => setDelta(0), [initial])
  useEffect(() => {
    const on = (e: Event) => setDelta((d) => d + Number((e as CustomEvent<number>).detail || 0))
    window.addEventListener('a-dismissed', on)
    return () => window.removeEventListener('a-dismissed', on)
  }, [])
  const needs = Math.max(0, initial + delta)
  const unreadMail = useUnreadMail()
  // In the icon rail the labels are visually hidden (still read out); a title gives sighted users a tooltip.
  const rail = useSideCollapsed()
  const at = (...roots: string[]) => roots.some((r) => path.startsWith(r))
  const groups: { label?: string; end?: boolean; items: Item[] }[] = [
    {
      items: [
        { href: '/admin', label: 'Today', icon: 'dash', on: path === '/admin', count: needs },
        { href: '/admin/calendar', label: 'Calendar', icon: 'calendar', on: at('/admin/calendar') },
      ],
    },
    {
      label: 'Work',
      items: [
        { href: '/admin/leads', label: 'Leads & Quotes', icon: 'leads', on: at('/admin/leads') },
        { href: '/admin/pipeline', label: 'Projects', icon: 'projects', on: at('/admin/pipeline', '/admin/projects') },
        { href: '/admin/emails', label: 'Emails', icon: 'mail', on: at('/admin/emails'), count: unreadMail, countLabel: 'unread' },
        { href: '/admin/money', label: 'Money', icon: 'money', on: at('/admin/money') },
        { href: '/admin/portals', label: 'Client portals', icon: 'portals', on: at('/admin/portals') },
        { href: '/admin/retainers', label: 'Retainers', icon: 'retainers', on: at('/admin/retainers') },
        { href: '/admin/galleries', label: 'Galleries', icon: 'galleries', on: at('/admin/galleries') },
      ],
    },
    {
      label: 'Clients and docs',
      items: [
        // Clients and People are one item: the two pages switch with the "Clients | People" pill in their header.
        { href: '/admin/clients', label: 'Clients', icon: 'finder', on: at('/admin/clients', '/admin/contacts') },
        { href: '/admin/proposals/new', label: 'Quote builder', icon: 'proposals', on: at('/admin/proposals') },
        { href: '/admin/library', label: 'Library', icon: 'library', on: at('/admin/library') },
      ],
    },
    {
      end: true,
      items: [
        { href: '/admin/settings', label: 'Settings', icon: 'settings', on: at('/admin/settings') },
        { href: '/studio/portal', label: 'Editor', icon: 'studio', external: 'opens the content editor in a new tab' },
      ],
    },
  ]
  return (
    <div className="a-nav">
      {groups.map((g, n) => (
        <div key={n} className={`a-nav-group${g.end ? ' a-nav-end' : ''}`}>
          {g.label && <p className="a-nav-label" id={`${id}-${n}`}>{g.label}</p>}
          <ul aria-labelledby={g.label ? `${id}-${n}` : undefined}>
            {g.items.map((i) => (
              <li key={i.href}>
                {i.external ? (
                  <a href={i.href} target="_blank" rel="noopener noreferrer" title={rail ? `${i.label} (${i.external})` : undefined}>
                    <Icon name={i.icon} />
                    <span className="a-nav-text">{i.label}</span> <span className="sr-only">({i.external})</span><span aria-hidden="true" className="a-ext">↗</span>
                  </a>
                ) : (
                  <Link href={i.href} aria-current={i.on ? 'page' : undefined} title={rail ? (i.count ? `${i.label} (${i.count} ${i.countLabel ?? 'need you'})` : i.label) : undefined}>
                    <Icon name={i.icon} />
                    <span className="a-nav-text">{i.label}</span>
                    {i.count ? <span className="a-badge" aria-label={`${i.count} ${i.countLabel ?? 'need you'}`}>{i.count}</span> : null}
                    <Pending />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
