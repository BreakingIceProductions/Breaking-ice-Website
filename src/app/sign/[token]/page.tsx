import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { getAdminSession } from '@/admin/auth'
import { fmtMoment } from '@/portal/quotes'
import { SignDoc } from '@/portal/sign-doc'
import { findByToken, markViewed } from '@/portal/sign-store'
import '@/portal/sign-doc.css'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ owner?: string }> }

// Never in search results, and the link itself is never sent on to other sites.
export const metadata: Metadata = { title: 'Sign', robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' }

/**
 * A signer's private door: one document, frozen as it was sent, with its fill-ins and Sign.
 * The owner can open it from the back office (?owner=1) to look without it counting as opened.
 * A client's document is signed inside their portal, so here it only points there.
 */
export default async function SignPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams])
  const r = await findByToken(token)
  const owner = sp.owner === '1' && Boolean(await getAdminSession().catch(() => null))
  if (r && !owner && r.audience === 'person') await markViewed(r)

  return (
    <div className="sg-page">
      <header className="sg-head">
        <span>
          <span className="logo-for-light"><Logo tone="light" height={28} /></span>
          <span className="logo-for-dark"><Logo tone="dark" height={28} /></span>
        </span>
        <ThemeToggle />
      </header>
      <main className="sg-body" id="main">
        {!r ? (
          <div className="sg-gate">
            <h1>This link isn’t active</h1>
            <p className="muted" style={{ margin: 0 }}>Check that the whole link was copied, or ask the person who sent it for a fresh one.</p>
          </div>
        ) : r.status === 'void' ? (
          <div className="sg-gate">
            <h1>This document was withdrawn</h1>
            <p className="muted" style={{ margin: 0 }}>{r.snapshot.title} is no longer waiting for a signature. If you think this is a mistake, reply to the email you got or contact Breaking Ice Productions.</p>
          </div>
        ) : r.audience === 'client' && !owner ? (
          <div className="sg-gate">
            <h1>Sign this in your client portal</h1>
            <p className="muted" style={{ margin: 0 }}>{r.snapshot.title} is signed in your Breaking Ice client portal, so we know it’s you.</p>
            <p style={{ margin: 0 }}><Link className="btn btn-primary" href={`/portal/documents/${r._id}`}>Open the client portal</Link></p>
          </div>
        ) : (
          <>
            <p className="sg-kicker">
              {r.audience === 'client' && r.org ? `${r.org} · ` : ''}{r.projectTitle ?? 'Breaking Ice Productions'}{r.status !== 'signed' ? ` · for ${r.recipient.name}` : ''}
            </p>
            <SignDoc
              token={r.token}
              title={r.snapshot.title}
              body={r.snapshot.body}
              fields={r.snapshot.fields}
              values={r.values}
              locked={owner ? 'You’re looking at this as the owner, so signing is switched off. The signer sees exactly this page.' : undefined}
              pdfHref={r.signature ? `/api/sign/pdf?token=${encodeURIComponent(r.token)}` : undefined}
              signed={r.signature ? { name: r.signature.name, at: r.signature.at, atLabel: fmtMoment(r.signature.at), forMinor: r.signature.forMinor, values: r.signature.values, certificateId: r.signature.certificateId, via: r.signature.via, portalEmail: r.signature.portalEmail } : undefined}
            />
          </>
        )}
      </main>
      <footer className="sg-foot">Breaking Ice Productions · Stony Plain, AB · Norman Wells, NT</footer>
    </div>
  )
}
