'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ICONS: Record<string, React.ReactNode> = {
  dash: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  projects: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>,
  clients: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  leads: <><path d="M4 5h16l-6 7v6l-4 2v-8Z" /></>,
  proposals: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  studio: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></>,
}

const Icon = ({ name }: { name: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
)

export function AdminNav({ needs = 0 }: { needs?: number }) {
  const path = usePathname()
  const items = [
    { href: '/admin', label: 'Dashboard', icon: 'dash', on: path === '/admin', count: needs },
    { href: '/admin/leads', label: 'Leads', icon: 'leads', on: path.startsWith('/admin/leads') },
    { href: '/admin/projects', label: 'Projects', icon: 'projects', on: path.startsWith('/admin/projects') },
    { href: '/admin/proposals/new', label: 'Proposals', icon: 'proposals', on: path.startsWith('/admin/proposals') },
    { href: '/admin/clients', label: 'Clients', icon: 'clients', on: path.startsWith('/admin/clients') },
    { href: '/admin/settings', label: 'Settings', icon: 'settings', on: path.startsWith('/admin/settings') },
  ]
  return (
    <ul className="a-nav">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} aria-current={i.on ? 'page' : undefined}>
            <Icon name={i.icon} />
            {i.label}
            {i.count ? <span className="a-badge" aria-label={`${i.count} need you`}>{i.count}</span> : null}
          </Link>
        </li>
      ))}
      <li>
        <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer">
          <Icon name="calendar" />
          Calendar <span className="sr-only">(opens Google Calendar)</span><span aria-hidden="true" className="a-ext">↗</span>
        </a>
      </li>
      <li>
        <a href="/studio/portal" target="_blank" rel="noopener noreferrer">
          <Icon name="studio" />
          Studio <span className="sr-only">(opens in a new tab)</span><span aria-hidden="true" className="a-ext">↗</span>
        </a>
      </li>
    </ul>
  )
}
