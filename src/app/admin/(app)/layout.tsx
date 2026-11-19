import Link from 'next/link'
import { Logo } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { requireAdmin } from '@/admin/auth'
import { calendarReady, ticktickReady, zohoReady } from '@/admin/config'
import { listProjects } from '@/admin/data'
import { needsAction } from '@/admin/insights'
import { isSalesStage, pageHref } from '@/admin/lead'
import { getPeople } from '@/admin/people'
import { AdminSearch, type SearchItem } from '@/admin/ui/search'
import { ticktickConnection } from '@/admin/ticktick'
import { AdminNav } from '@/admin/ui/nav'
import { zohoConnection } from '@/admin/zoho'
import { r2Ready } from '@/portal/r2'

export const dynamic = 'force-dynamic'

export default async function AdminApp({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const [tt, zoho, projects, people] = await Promise.all([ticktickConnection().catch(() => null), zohoConnection().catch(() => null), listProjects().catch(() => []), getPeople().catch(() => null)])
  const clients = new Map(projects.filter((p) => p.client._id).map((p) => [p.client._id, p.client.organizationName]))
  const search: SearchItem[] = [
    { group: 'Actions', label: 'New proposal', sub: 'Open the builder', href: '/admin/proposals/new' },
    { group: 'Actions', label: 'New lead', sub: 'Add someone who got in touch', href: '/admin/leads/new' },
    { group: 'Actions', label: 'New project', sub: 'Opens the Studio', href: '/studio/portal/intent/create/template=clientProject;type=clientProject', external: true },
    { group: 'Go to', label: 'Today', href: '/admin' },
    { group: 'Go to', label: 'Pipeline', sub: 'Leads and projects on one board', href: '/admin/pipeline' },
    { group: 'Go to', label: 'Client portals', sub: 'What each portal is waiting on', href: '/admin/portals' },
    { group: 'Go to', label: 'Projects list and archive', href: '/admin/projects?view=list' },
    { group: 'Go to', label: 'Clients', sub: 'Everyone in one list', href: '/admin/contacts' },
    { group: 'Go to', label: 'Finder', sub: 'Clients, projects and files', href: '/admin/clients' },
    { group: 'Go to', label: 'Settings and connections', href: '/admin/settings' },
    ...projects.map((p) => ({ group: 'Projects' as const, label: p.title, sub: `${p.client.organizationName}${isSalesStage(p.pipelineStage) ? ' · lead' : ''}${p.archived ? ' · archived' : ''}`, href: pageHref(p._id, p.pipelineStage) })),
    ...[...clients].map(([id, name]) => ({ group: 'Clients' as const, label: name, href: `/admin/clients/${id}` })),
    // Contacts-only people: crew, vendors, partners. Client contacts are found through their company.
    ...(people?.people ?? []).map((p) => ({ group: 'People' as const, label: p.name, sub: [p.company, p.role, ...(p.tags ?? [])].filter(Boolean).join(' · ') || 'Contact', href: `/admin/contacts?person=${encodeURIComponent(`p:${p._key}`)}` })),
  ]
  const links = [
    { name: 'Zoho Books', on: Boolean(zoho), setUp: zohoReady() },
    { name: 'TickTick', on: Boolean(tt), setUp: ticktickReady() },
    { name: 'Google Calendar', on: calendarReady(), setUp: calendarReady() },
    { name: 'Review storage', on: r2Ready(), setUp: r2Ready() },
  ]
  return (
    <div className="a-shell">
      <a href="#main" className="skip">Skip to content</a>
      <nav className="a-side" aria-label="Back office">
        <Link href="/admin" className="a-logo" aria-label="Back office home">
          <Logo tone="dark" height={28} />
        </Link>
        <AdminSearch items={search} />
        <AdminNav needs={needsAction(projects.filter((p) => !p.archived)).length} />
        <div className="a-side-foot">
          <p className="a-side-label">Connections</p>
          <ul className="a-conn">
            {links.map((l) => (
              <li key={l.name}>
                <span>{l.name}</span>
                <span className={`a-conn-state ${l.on ? 'on' : 'off'}`}>{l.on ? 'Connected' : l.setUp ? 'Not connected' : 'Not set up'}</span>
              </li>
            ))}
          </ul>
          <div className="a-side-tools">
            <ThemeToggle />
            <form action="/api/admin/sign-out" method="post">
              <button type="submit" className="a-signout">Sign out</button>
            </form>
          </div>
        </div>
      </nav>
      <main id="main" className="a-main">
        {admin.sample && (
          <p className="a-sample" role="status">Sample data: Sanity isn’t connected on this machine, so nothing you do here is saved.</p>
        )}
        {admin.viewOnly && (
          <p className="a-sample" role="status">View only: you can look around, but changes, emails and payments are switched off.</p>
        )}
        {children}
      </main>
    </div>
  )
}
