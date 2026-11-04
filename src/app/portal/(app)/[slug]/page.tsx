import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { requireAccess } from '@/portal/current'
import { getPortalSettings, producerFor } from '@/portal/data'
import { Delivery } from '@/portal/delivery'
import { billingStatus, CLIENT_STAGES, clientStage } from '@/portal/library'
import { PaymentList } from '@/portal/payment-list'
import { ProjectLibrary } from '@/portal/portal-library'
import { fmtDate, ProducerCard, StageBar } from '@/portal/ui'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pay?: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const { projects } = await requireAccess()
  return { title: projects.find((p) => p.slug === slug)?.title ?? 'Project' }
}

export default async function PortalProject({ params, searchParams }: Props) {
  const { slug } = await params
  const { pay: note } = await searchParams
  const { projects, session, clients, payments } = await requireAccess()
  const p = projects.find((x) => x.slug === slug)
  if (!p) notFound()
  const ps = await getPortalSettings()
  const me = clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === session.email)
  const billing = billingStatus(p.billing)
  const dates = (p.keyDates ?? []).filter((k) => k.label).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  // Invoice details stay on the server; the browser only gets the status above.
  const forBrowser = { ...p, billing: undefined }

  return (
    <div className="wrap p-project">
      <header className="p-project-head">
        <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
          {p.startDate && <span className="fd-kicker p-kicker">{p.startDate}</span>}
          <h1 className="h1">{p.title}</h1>
          {p.summary && <p className="body-lg muted" style={{ margin: 0, maxWidth: '62ch' }}>{p.summary}</p>}
        </div>
      </header>

      {p.status === 'delivered' && <Delivery project={forBrowser} demo={Boolean(session.demo)} />}

      <section id="overview" className="p-where p-anchor" aria-labelledby="where-h">
        <h2 id="where-h" className="p-label">Where we are</h2>
        <StageBar stage={clientStage(p.pipelineStage, p.status)} names={CLIENT_STAGES.map((s) => s.title)} />
      </section>

      <div className="p-cards">
        {p.nextStep && (
          <section className="p-card" aria-labelledby="next-h">
            <h2 id="next-h" className="p-label">Next step</h2>
            <p style={{ margin: 0 }}>{p.nextStep}</p>
          </section>
        )}
        {dates.length > 0 && (
          <section className="p-card" aria-labelledby="dates-h">
            <h2 id="dates-h" className="p-label">Key dates</h2>
            <dl className="key-dates">
              {dates.map((k) => (
                <div key={k._key}><dt>{k.label}</dt><dd>{k.date ? fmtDate(k.date, { weekday: 'short', month: 'short', day: 'numeric' }) : 'To be set'}</dd></div>
              ))}
            </dl>
          </section>
        )}
        {/* Clients who pay in the portal see each payment; others see the invoice status. */}
        {payments.some((x) => x.projectId === p._id) ? (
          <PaymentList id="billing" payments={payments.filter((x) => x.projectId === p._id)} back={`/portal/${p.slug}`} note={note} />
        ) : billing && (
          <section id="billing" className="p-card p-anchor" aria-labelledby="bill-h">
            <h2 id="bill-h" className="p-label">Billing</h2>
            <p className={`billing billing-${billing.tone}`}><span className="billing-dot" aria-hidden="true" />{billing.label}</p>
          </section>
        )}
        <ProducerCard producer={producerFor(p, ps)} />
      </div>

      <section id="work" aria-labelledby="work-h" className="p-work p-anchor">
        <h2 id="work-h" className="h3">Your work</h2>
        <Suspense>
          <ProjectLibrary project={forBrowser} demo={Boolean(session.demo)} uploaderName={me?.name ?? ''} />
        </Suspense>
      </section>
    </div>
  )
}
