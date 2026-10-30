import Link from 'next/link'
import { Logo } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { requireAdmin } from '@/admin/auth'
import { calendarReady, ticktickReady, zohoReady } from '@/admin/config'
import { ticktickConnection } from '@/admin/ticktick'
import { AdminNav } from '@/admin/ui/nav'
import { zohoConnection } from '@/admin/zoho'

export const dynamic = 'force-dynamic'

export default async function AdminApp({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const [tt, zoho] = await Promise.all([ticktickConnection().catch(() => null), zohoConnection().catch(() => null)])
  const links = [
    { name: 'Zoho Books', on: Boolean(zoho), setUp: zohoReady() },
    { name: 'TickTick', on: Boolean(tt), setUp: ticktickReady() },
    { name: 'Google Calendar', on: calendarReady(), setUp: calendarReady() },
  ]
  return (
    <div className="a-shell">
      <a href="#main" className="skip">Skip to content</a>
      <nav className="a-side" aria-label="Back office">
        <Link href="/admin" className="a-logo" aria-label="Back office home">
          <Logo tone="dark" height={28} />
        </Link>
        <AdminNav />
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
        {children}
      </main>
    </div>
  )
}
