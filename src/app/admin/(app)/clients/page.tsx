import Link from 'next/link'
import '../../../css/admin-pages.css'
import '../../../css/admin-simple-a.css'
import '../../../css/admin-simple-b.css'
import '../../../css/admin-simple-c.css'
import { Suspense } from 'react'
import { requireAdmin } from '@/admin/auth'
import { adminSampleMode } from '@/admin/config'
import { r2Ready } from '@/portal/r2'
import { listClients } from '@/admin/data'
import { stageTitle } from '@/admin/stages'
import { AdminLibrary, type LibProject } from '@/admin/ui/library'
import { ClientsTabs } from '@/admin/ui/clients-tabs'

export const metadata = { title: 'Clients' }

export default async function Clients() {
  await requireAdmin()
  const clients = await listClients()
  const projects: LibProject[] = clients.flatMap((c) =>
    c.projects.map((p) => ({
      _id: p._id,
      slug: p.slug,
      title: p.title,
      startDate: p.startDate,
      status: p.status,
      pipelineStage: p.pipelineStage,
      stageTitle: stageTitle(p.pipelineStage),
      nextStep: p.nextStep,
      clientId: c._id,
      deliverables: p.deliverables,
    })),
  )
  return (
    <div className="a-page a-page-wide">
      <header className="a-head sc-chead">
        <div className="sc-title">
          <h1 className="a-h1">Clients</h1>
          <ClientsTabs on="clients" />
        </div>
        <Link className="btn btn-secondary" href="/admin/clients/new">New client</Link>
      </header>
      <div className="sc-clients">
      <Suspense>
        <AdminLibrary
          clients={clients.map((c) => ({ _id: c._id, organizationName: c.organizationName, contacts: c.contacts }))}
          projects={projects}
          reviewUpload={r2Ready() || adminSampleMode()}
        />
      </Suspense>
      </div>
    </div>
  )
}
