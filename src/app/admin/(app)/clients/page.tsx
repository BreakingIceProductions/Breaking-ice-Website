import Link from 'next/link'
import '../../../css/admin-pages.css'
import { Suspense } from 'react'
import { requireAdmin } from '@/admin/auth'
import { adminSampleMode } from '@/admin/config'
import { r2Ready } from '@/portal/r2'
import { listClients } from '@/admin/data'
import { stageTitle } from '@/admin/stages'
import { AdminLibrary, type LibProject } from '@/admin/ui/library'

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
      <header className="a-head">
        <div className="stack ap-head-text">
          <h1 className="a-h1">Clients</h1>
          <p className="muted m0">Files by client: each client’s projects, cuts and documents.</p>
        </div>
        <Link className="btn btn-secondary" href="/admin/clients/new">New client</Link>
      </header>
      <Suspense>
        <AdminLibrary
          clients={clients.map((c) => ({ _id: c._id, organizationName: c.organizationName, contacts: c.contacts }))}
          projects={projects}
          reviewUpload={r2Ready() || adminSampleMode()}
        />
      </Suspense>
    </div>
  )
}
