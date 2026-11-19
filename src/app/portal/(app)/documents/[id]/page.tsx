import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAccess } from '@/portal/current'
import { fmtMoment } from '@/portal/quotes'
import { SignDoc } from '@/portal/sign-doc'
import { getRequest, markViewed } from '@/portal/sign-store'
import '@/portal/sign-doc.css'

type Props = { params: Promise<{ id: string }> }

export const metadata = { title: 'Document to sign' }

/** A client's document to sign, inside their portal. Any of the client's contacts can open it. */
export default async function PortalDocument({ params }: Props) {
  const { id } = await params
  const { session, clients, projects } = await requireAccess()
  const r = /^sign-[\w-]+$/.test(id) ? await getRequest(id) : null
  if (!r || r.audience !== 'client' || !r.clientId || !clients.some((c) => c._id === r.clientId)) notFound()
  if (!session.preview) await markViewed(r)
  const project = projects.find((p) => p._id === r.projectId)
  const me = clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === session.email)

  return (
    <div className="wrap p-project">
      {project && <Link className="text-link-plain muted small" href={`/portal/${project.slug}`}>← {project.title}</Link>}
      <header className="p-project-head">
        <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
          <span className="fd-kicker p-kicker">{r.org}{r.projectTitle ? ` · ${r.projectTitle}` : ''}</span>
          <h1 className="h1">{r.status === 'signed' ? 'Signed' : r.status === 'void' ? 'Withdrawn' : 'To sign'}</h1>
        </div>
      </header>
      {r.status === 'void' ? (
        <section className="p-card">
          <h2 className="h3" style={{ margin: 0 }}>This document was withdrawn</h2>
          <p className="muted" style={{ margin: 0 }}>{r.snapshot.title} is no longer waiting for a signature. Questions? Reply to our email.</p>
        </section>
      ) : (
        <SignDoc
          token={r.token}
          title={r.snapshot.title}
          body={r.snapshot.body}
          fields={r.snapshot.fields}
          values={r.values}
          locked={session.preview ? 'You’re viewing as the client, so signing is switched off. Everything else looks as it does for them.' : undefined}
          pdfHref={r.signature ? `/api/sign/pdf?token=${encodeURIComponent(r.token)}` : undefined}
          defaultName={session.preview ? '' : (me?.name ?? '')}
          signed={r.signature ? { name: r.signature.name, at: r.signature.at, atLabel: fmtMoment(r.signature.at), forMinor: r.signature.forMinor, values: r.signature.values, certificateId: r.signature.certificateId, via: r.signature.via, portalEmail: r.signature.portalEmail } : undefined}
        />
      )}
    </div>
  )
}
