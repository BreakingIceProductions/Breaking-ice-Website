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
import { isSalesStage, prospectIds } from '@/admin/lead'
import { stageTitle } from '@/admin/stages'
import { AdminLibrary, type LibProject } from '@/admin/ui/library'
import { ClientsTabs } from '@/admin/ui/clients-tabs'

export const metadata = { title: 'Clients' }

type Props = { searchParams: Promise<{ at?: string | string[] }> }

/**
 * Clients and their projects. Leads stay on Leads & Quotes: clients that are only leads so far are left out, and so
 * are leads of real clients. A link straight to one (a lead card's "Add a document") still opens it.
 */
export default async function Clients({ searchParams }: Props) {
  await requireAdmin()
  const [all, sp] = await Promise.all([listClients(), searchParams])
  const at = (Array.isArray(sp.at) ? sp.at[0] : sp.at ?? '').split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x) } catch { return x } })
  const prospects = prospectIds(all.flatMap((c) => c.projects))
  const asked = (clientId: string, p?: { slug?: string; _id: string }) => at[0] === clientId && (!p || at[1] === p.slug || at[1] === p._id)
  const clients = all
    .filter((c) => !prospects.has(c._id) || asked(c._id))
    .map((c) => ({ ...c, projects: c.projects.filter((p) => !isSalesStage(p.pipelineStage) || asked(c._id, p)) }))
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
