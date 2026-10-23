import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { adminPendingEmail, getAdminSession } from '@/admin/auth'
import { AdminSignInForm } from '@/admin/ui/sign-in-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sign in' }

type Props = { searchParams: Promise<Record<string, string | undefined>> }

export default async function AdminSignIn({ searchParams }: Props) {
  const sp = await searchParams
  if (await getAdminSession()) redirect('/admin')
  const pending = await adminPendingEmail()
  return (
    <main id="main" className="a-signin">
      <div className="a-signin-card">
        <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
          <span className="logo-link" style={{ ['--logo-h' as string]: '28px' }}>
            <Logo className="logo-for-light" height={28} />
            <Logo tone="dark" className="logo-for-dark" height={28} />
          </span>
          <ThemeToggle />
        </div>
        <AdminSignInForm
          initialPending={pending ?? undefined}
          notice={sp.error === 'link' ? 'That link has expired. Ask for a new one.' : sp['signed-out'] ? 'You’re signed out.' : undefined}
        />
      </div>
    </main>
  )
}
