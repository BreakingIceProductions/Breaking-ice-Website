import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo, Mark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { getSession, pendingEmail } from '@/portal/auth'
import { portalEnv } from '@/portal/config'
import { getPortalSettings, portalImage } from '@/portal/data'
import { SignInForm } from '@/portal/sign-in-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sign in' }

type Props = { searchParams: Promise<Record<string, string | undefined>> }

export default async function SignIn({ searchParams }: Props) {
  const sp = await searchParams
  if (await getSession()) redirect('/portal')
  const [ps, pending] = await Promise.all([getPortalSettings(), pendingEmail()])
  const img = portalImage(ps.signInImage, 1400, 1600)
  const next = sp.next?.startsWith('/portal/') ? sp.next : undefined

  return (
    <div className="signin">
      <div className="signin-art dark shard-field" aria-hidden="true">
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="signin-img" />
        )}
        <div className="signin-art-inner">
          <Mark size={72} right="var(--warm-white)" />
          <p className="quote">Every version, every file, every date, in one place.</p>
        </div>
      </div>

      <main id="main" className="signin-panel">
        <div className="signin-top">
          <Link href="/" className="logo-link" aria-label="Breaking Ice Productions, home">
            <Logo className="logo-for-light" height={32} />
            <Logo tone="dark" className="logo-for-dark" height={32} />
          </Link>
          <ThemeToggle />
        </div>

        <div className="signin-body">
          <span className="eyebrow">Client portal</span>
          <SignInForm
            headline={ps.signInHeadline}
            intro={ps.signInIntro}
            checkHeadline={ps.checkEmailHeadline}
            checkMessage={ps.checkEmailMessage}
            demo={portalEnv.demo}
            initialPending={pending ?? undefined}
            next={next}
            notice={sp.error === 'link' ? 'That sign-in link has expired or was already replaced by a newer one. Ask for a new one below.' : sp['signed-out'] ? 'You’re signed out.' : undefined}
          />
          <p className="muted small signin-foot">
            Not a client yet? <Link className="text-link" href="/contact">Start a conversation</Link>
          </p>
        </div>

        <Link href="/" className="link-arrow signin-back">← Back to the Breaking Ice website</Link>
      </main>
    </div>
  )
}
