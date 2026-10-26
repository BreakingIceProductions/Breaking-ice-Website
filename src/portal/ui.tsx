import Link from 'next/link'
import { Logo, Mark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { portalImage } from './data'
import type { ClientProject, Deliverable, Producer } from './types'

export const PROJECT_LABEL: Record<ClientProject['status'], string> = {
  'in-production': 'In production',
  'in-review': 'In review',
  delivered: 'Delivered',
}
export const DELIVERABLE_LABEL: Record<Deliverable['status'], string> = {
  'in-progress': 'In progress',
  'awaiting-feedback': 'Awaiting your feedback',
  'changes-requested': 'Changes in progress',
  approved: 'Approved',
}

export const fmtDate = (d?: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-CA', opts) : ''

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 90) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.round(m)} min ago`
  const h = m / 60
  if (h < 24) return `${Math.round(h)} h ago`
  const d = h / 24
  if (d < 7) return `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'} ago`
  return fmtDate(iso)
}

export function daysUntil(date?: string) {
  if (!date) return null
  return Math.round((Date.parse(`${date}T12:00:00`) - Date.now()) / 86_400_000)
}

export function StatusPill({ status, kind = 'project' }: { status: string; kind?: 'project' | 'deliverable' }) {
  const label = kind === 'project' ? PROJECT_LABEL[status as ClientProject['status']] : DELIVERABLE_LABEL[status as Deliverable['status']]
  return <span className={`pill pill-${status}`}>{label ?? status}</span>
}

/** Where a project sits, as a row of steps (stage is 1-based). */
export function StageBar({ stage, names, dates, compact }: { stage: number; names: string[]; dates?: string[]; compact?: boolean }) {
  return (
    <ol className={`stagebar${compact ? ' compact' : ''}`} style={{ ['--n' as string]: names.length }} aria-label={`Stage ${stage} of ${names.length}: ${names[stage - 1]}`}>
      {names.map((n, i) => {
        const state = i + 1 < stage ? 'done' : i + 1 === stage ? 'current' : 'next'
        return (
          <li key={n} className={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="bar" aria-hidden="true" />
            {!compact && (
              <>
                <span className="n">{String(i + 1).padStart(2, '0')} · {state === 'done' ? 'Done' : state === 'current' ? 'Now' : 'Next'}</span>
                <span className="name">{n}</span>
                {dates?.[i] && <span className="when">{dates[i]}</span>}
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function ProducerCard({ producer, title = 'Your producer' }: { producer?: Producer; title?: string }) {
  if (!producer?.name) return null
  const img = portalImage(producer.portrait, 160, 160)
  return (
    <section className="p-card" aria-labelledby="producer-h">
      <h2 id="producer-h" className="p-label">{title}</h2>
      <div className="producer">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" width={64} height={64} />
        ) : (
          <span className="avatar" aria-hidden="true">{producer.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
        )}
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <strong>{producer.name}</strong>
          {producer.role && <span className="muted small">{producer.role}</span>}
        </div>
      </div>
      <ul className="contact-lines">
        {producer.email && <li><a className="text-link" href={`mailto:${producer.email}`}>{producer.email}</a></li>}
        {producer.phone && <li><a className="text-link" href={`tel:${producer.phone.replace(/[^\d+]/g, '')}`}>{producer.phone}</a></li>}
      </ul>
    </section>
  )
}

export function PortalHeader({ name, demo }: { name?: string; demo?: boolean }) {
  return (
    <header className="p-header">
      <div className="wrap">
        <Link href="/portal" className="logo-link" aria-label="Client portal home">
          <Logo className="logo-for-light" />
          <Logo tone="dark" className="logo-for-dark" />
        </Link>
        <span className="p-header-label">Client portal</span>
        <nav className="p-nav" aria-label="Portal">
          <Link href="/portal">Projects</Link>
          <a href="/" target="_blank" rel="noopener">Website ↗</a>
        </nav>
        <div className="header-tools">
          <ThemeToggle />
          {name && <span className="p-who" title={demo ? 'Sample client' : undefined}>{name}</span>}
          <form action="/api/portal/sign-out" method="post">
            <button type="submit" className="btn btn-secondary btn-sm">Sign out</button>
          </form>
        </div>
      </div>
      {demo && (
        <div className="p-demo-ribbon">
          Sample project · this is what clients see. Nothing here is real, and nothing you do is sent.
        </div>
      )}
    </header>
  )
}

export function PortalFooter() {
  return (
    <footer className="p-footer">
      <div className="wrap">
        <span>© {new Date().getFullYear()} Breaking Ice Productions</span>
        <nav aria-label="Footer">
          <a href="/">Website</a>
          <a href="/privacy">Privacy</a>
          <a href="/accessibility">Accessibility</a>
        </nav>
        <span className="muted">Reviews are hosted on Vimeo</span>
      </div>
    </footer>
  )
}

export function EmptyMark() {
  return <Mark size={40} right="var(--ink)" />
}
