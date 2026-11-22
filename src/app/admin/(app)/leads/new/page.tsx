import '../../../../css/admin-pages.css'
import '../../../../css/admin-simple-a.css'
import '../../../../css/admin-simple-c.css'
import { requireAdmin } from '@/admin/auth'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import { LeadForm } from '@/admin/ui/lead'
import { FormDraft } from '../../_draft'

export const metadata = { title: 'New lead' }

export default async function NewLead() {
  await requireAdmin()
  return (
    <div className="a-page ld-page-narrow">
      <Breadcrumb trail={[{ label: 'Pipeline', href: '/admin/pipeline' }]} />
      <header className="a-head">
        <h1 className="a-h1">New lead</h1>
      </header>
      <FormDraft storageKey="bi-draft-new-lead"><LeadForm /></FormDraft>
    </div>
  )
}
