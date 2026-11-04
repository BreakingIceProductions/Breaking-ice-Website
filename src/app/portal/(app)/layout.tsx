import { Suspense } from 'react'
import { requireAccess } from '@/portal/current'
import { getPortalSettings, portalImage, producerFor } from '@/portal/data'
import { billingStatus, byStart, CLIENT_STAGES, clientCanOpen, clientStage } from '@/portal/library'
import { PortalSidebar, type NavProject } from '@/portal/sidebar'
import { PortalFooter, PortalHeader } from '@/portal/ui'

export const dynamic = 'force-dynamic'

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const { session, name, quotes, clients, projects } = await requireAccess()
  const ps = await getPortalSettings()
  const nav: NavProject[] = [...projects].sort(byStart).map((p) => ({
    slug: p.slug,
    title: p.title,
    stage: CLIENT_STAGES[clientStage(p.pipelineStage, p.status) - 1].title,
    done: p.status === 'delivered' || p.pipelineStage === 'delivered' || p.pipelineStage === 'paid',
    delivered: p.status === 'delivered',
    billing: Boolean(billingStatus(p.billing)),
    waiting: (p.deliverables ?? []).filter((d) => d.status === 'awaiting-feedback' && clientCanOpen(d, p.deliverables)).length,
  }))
  const producer = clients[0] ? producerFor({ client: clients[0] }, ps) : ps.producer
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <PortalHeader name={name} demo={session.demo} previewOf={session.preview ? clients[0]?.organizationName ?? 'the client' : undefined} />
      <div className={`p-shell${session.demo || session.preview ? ' with-ribbon' : ''}`}>
        <Suspense>
          <PortalSidebar
            projects={nav}
            quotes={quotes.map((q) => ({ slug: q.slug, title: q.title, signed: Boolean(q.signature) }))}
            waiting={nav.reduce((n, p) => n + p.waiting, 0)}
            producer={producer?.name ? { name: producer.name, role: producer.role, email: producer.email, phone: producer.phone, photo: portalImage(producer.portrait, 80, 80) } : undefined}
          />
        </Suspense>
        <main id="main" className="p-main">{children}</main>
      </div>
      <PortalFooter />
    </>
  )
}
