import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { LeadForm } from '@/admin/ui/lead'

export const metadata = { title: 'New lead' }

export default async function NewLead() {
  await requireAdmin()
  return (
    <div className="a-page ld-page-narrow">
      <Link className="text-link-plain muted small" href="/admin/pipeline">← Pipeline</Link>
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">Pipeline</span>
          <h1 className="a-h1">New lead</h1>
          <p className="muted" style={{ margin: 0 }}>Someone got in touch. Add what you know now; the rest can wait for the call.</p>
        </div>
      </header>
      <LeadForm />
    </div>
  )
}
