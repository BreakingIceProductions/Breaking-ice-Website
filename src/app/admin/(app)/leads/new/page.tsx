import '../../../../css/admin-pages.css'
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
        <div className="stack ap-gap-3">
          <h1 className="a-h1">New lead</h1>
          <p className="muted m0">Someone got in touch. Add what you know now; the rest can wait for the call.</p>
        </div>
      </header>
      <FormDraft storageKey="bi-draft-new-lead"><LeadForm /></FormDraft>
    </div>
  )
}
