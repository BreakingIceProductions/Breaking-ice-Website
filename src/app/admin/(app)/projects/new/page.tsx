import '../../../../css/admin-pages.css'
import '../../../../css/admin-simple-a.css'
import '../../../../css/admin-simple-c.css'
import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { listClients } from '@/admin/data'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import { HelpTip } from '@/admin/ui/help-tip'
import { NewProjectForm } from '@/admin/ui/new-project-form'
import { FormDraft } from '../../_draft'

export const metadata = { title: 'New project' }

type Props = { searchParams: Promise<{ client?: string }> }

export default async function NewProject({ searchParams }: Props) {
  const admin = await requireAdmin()
  const [clients, sp] = await Promise.all([listClients(), searchParams])
  const options = clients
    .map((c) => ({ _id: c._id, organizationName: c.organizationName }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName))
  return (
    <div className="a-page ld-page-narrow">
      <Breadcrumb trail={[{ label: 'All projects', href: '/admin/projects?view=list' }]} />
      <header className="a-head">
        <div className="sc-title">
          <h1 className="a-h1">New project</h1>
          <HelpTip label="About new projects">A job that’s already agreed. For someone just getting in touch, <Link className="text-link" href="/admin/leads/new">add a lead</Link> instead.</HelpTip>
        </div>
      </header>
      <FormDraft storageKey={`bi-draft-new-project${sp.client ? `-${sp.client}` : ''}`}><NewProjectForm clients={options} initialClient={sp.client} canEdit={!admin.viewOnly} /></FormDraft>
    </div>
  )
}
