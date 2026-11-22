import { cookies } from 'next/headers'
import Link from 'next/link'
import { Logo, Mark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { requireAdmin } from '@/admin/auth'
import { loadMoney } from '@/admin/money-data'
import { needsYouCount } from '@/admin/needs-you'
import { isSalesStage, pageHref } from '@/admin/lead'
import { getPeople } from '@/admin/people'
import { FeedbackProvider } from '@/admin/ui/confirm'
import { AdminSearch, SearchButton, type SearchItem } from '@/admin/ui/search'
import { AdminNav } from '@/admin/ui/nav'
import { PhoneMenu } from '@/admin/ui/phone-menu'
import { SIDE_KEY, SideShell, SideToggle } from '@/admin/ui/side-toggle'

export const dynamic = 'force-dynamic'

export default async function AdminApp({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  // Collapsed sidebar is remembered in a cookie so the server renders the right width on first paint.
  const collapsed = (await cookies()).get(SIDE_KEY)?.value === 'collapsed'
  // The same load as Today, so the nav badge counts exactly what Today's "Needs you" list shows.
  const [money, people] = await Promise.all([loadMoney().catch(() => ({ projects: [], payments: [], goals: {} })), getPeople().catch(() => null)])
  const projects = money.projects
  const clients = new Map(projects.filter((p) => p.client._id).map((p) => [p.client._id, p.client.organizationName]))
  const search: SearchItem[] = [
    { group: 'Actions', label: 'New proposal', sub: 'Open the builder', href: '/admin/proposals/new' },
    { group: 'Actions', label: 'New lead', sub: 'Add someone who got in touch', href: '/admin/leads/new' },
    { group: 'Actions', label: 'New project', sub: 'Start a project for a client', href: '/admin/projects/new' },
    { group: 'Go to', label: 'Today', href: '/admin' },
    { group: 'Go to', label: 'Pipeline', sub: 'Leads and projects on one board', href: '/admin/pipeline' },
    { group: 'Go to', label: 'Client portals', sub: 'What each portal is waiting on', href: '/admin/portals' },
    { group: 'Go to', label: 'Projects list and archive', href: '/admin/projects?view=list' },
    { group: 'Go to', label: 'Clients', sub: 'Each client’s projects and files', href: '/admin/clients' },
    { group: 'Go to', label: 'People', sub: 'Everyone in one list: clients, crew, partners', href: '/admin/contacts' },
    { group: 'Go to', label: 'Library', sub: 'Documents to sign, client emails, out and signed', href: '/admin/library' },
    { group: 'Go to', label: 'Settings and connections', href: '/admin/settings' },
    ...projects.map((p) => ({ group: 'Projects' as const, label: p.title, sub: `${p.client.organizationName}${isSalesStage(p.pipelineStage) ? ' · lead' : ''}${p.archived ? ' · archived' : ''}`, href: pageHref(p._id, p.pipelineStage) })),
    ...[...clients].map(([id, name]) => ({ group: 'Clients' as const, label: name, href: `/admin/clients/${id}` })),
    // Contacts-only people: crew, vendors, partners. Client contacts are found through their company.
    ...(people?.people ?? []).map((p) => ({ group: 'People' as const, label: p.name, sub: [p.company, p.role, ...(p.tags ?? [])].filter(Boolean).join(' · ') || 'Contact', href: `/admin/contacts?person=${encodeURIComponent(`p:${p._key}`)}` })),
  ]
  const needs = needsYouCount(money.projects, money.payments, money.goals)
  const signOut = (
    <form action="/api/admin/sign-out" method="post">
      <button type="submit" className="a-signout" title="Sign out">
        <svg className="a-signout-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>
        <span className="a-signout-text">Sign out</span>
      </button>
    </form>
  )
  return (
    <SideShell initial={collapsed}>
      <FeedbackProvider>
        <a href="#main" className="skip">Skip to content</a>
        {/* Phones and small tablets: a slim top bar; the menu opens in a sheet. */}
        <header className="a-top">
          <Link href="/admin" className="a-logo" aria-label="Back office home">
            <Logo tone="dark" height={24} />
          </Link>
          <SearchButton compact />
          <PhoneMenu foot={<><ThemeToggle />{signOut}</>}>
            <nav aria-label="Back office">
              <AdminNav needs={needs} id="a-sheet-nav" />
            </nav>
          </PhoneMenu>
        </header>
        <nav className="a-side" id="a-side" aria-label="Back office">
          <div className="a-side-head">
            <Link href="/admin" className="a-logo" aria-label="Back office home" title="Back office home">
              <Logo tone="dark" height={28} className="a-logo-full" />
              <Mark size={26} left="var(--copper)" right="var(--warm-white)" className="a-logo-mark" />
            </Link>
            <SideToggle />
          </div>
          <SearchButton />
          <AdminNav needs={needs} />
          <div className="a-side-foot">
            <div className="a-side-tools">
              <ThemeToggle />
              {signOut}
            </div>
          </div>
        </nav>
        <AdminSearch items={search} />
        <main id="main" className="a-main">
          {admin.sample && (
            <p className="a-sample" role="status">Sample data: nothing you do here is kept for good, and no emails or payments go out.</p>
          )}
          {admin.viewOnly && (
            <p className="a-sample" role="status">View only: you can look around, but changes, emails and payments are switched off.</p>
          )}
          {children}
        </main>
      </FeedbackProvider>
    </SideShell>
  )
}
