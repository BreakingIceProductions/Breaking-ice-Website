import { Suspense } from 'react'
import { requireAdmin } from '@/admin/auth'
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
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">Library</span>
          <h1 className="a-h1">Clients</h1>
        </div>
        <a className="btn btn-primary" href="/studio/portal/intent/create/template=client;type=client" target="_blank" rel="noopener noreferrer">
          New client<span className="sr-only"> (opens the Studio)</span>
        </a>
      </header>
      <Suspense>
        <AdminLibrary
          clients={clients.map((c) => ({ _id: c._id, organizationName: c.organizationName, contacts: c.contacts }))}
          projects={projects}
        />
      </Suspense>
    </div>
  )
}
