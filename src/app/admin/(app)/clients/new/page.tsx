import '../../../../css/admin-pages.css'
import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import { NewClientForm } from '@/admin/ui/new-client-form'
import { FormDraft } from '../../_draft'

export const metadata = { title: 'New client' }

type Props = { searchParams: Promise<{ from?: string }> }

export default async function NewClient({ searchParams }: Props) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const back = sp.from === 'people' ? { label: 'People', href: '/admin/contacts' } : { label: 'Clients', href: '/admin/clients' }
  return (
    <div className="a-page ld-page-narrow">
      <Breadcrumb trail={[back]} />
      <header className="a-head">
        <div className="stack ap-head-text">
          <h1 className="a-h1">New client</h1>
          <p className="muted m0">An organisation and the person you deal with there. To add work for them too, <Link className="text-link" href="/admin/projects/new">start a project</Link> instead: it can make the client as it goes.</p>
        </div>
      </header>
      <FormDraft storageKey="bi-draft-new-client"><NewClientForm canEdit={!admin.viewOnly} cancelHref={back.href} /></FormDraft>
    </div>
  )
}
