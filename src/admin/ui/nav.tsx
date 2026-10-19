'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ICONS: Record<string, React.ReactNode> = {
  dash: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  projects: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  studio: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></>,
}

const Icon = ({ name }: { name: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
)

export function AdminNav() {
  const path = usePathname()
  const items = [
    { href: '/admin', label: 'Dashboard', icon: 'dash', on: path === '/admin' },
    { href: '/admin/projects', label: 'Projects', icon: 'projects', on: path.startsWith('/admin/projects') },
    { href: '/admin/settings', label: 'Settings', icon: 'settings', on: path.startsWith('/admin/settings') },
  ]
  return (
    <ul className="a-nav">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} aria-current={i.on ? 'page' : undefined}>
            <Icon name={i.icon} />
            {i.label}
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
