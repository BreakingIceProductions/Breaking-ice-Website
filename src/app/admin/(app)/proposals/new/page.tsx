import { requireAdmin } from '@/admin/auth'
import { ProposalBuilder } from '@/admin/ui/proposal-builder'

export const metadata = { title: 'Quote builder' }

export default async function NewProposal() {
  await requireAdmin()
  return (
    <div className="a-page a-page-wide">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">Prototype</span>
          <h1 className="a-h1">Quote builder</h1>
          <p className="muted small" style={{ margin: 0, maxWidth: 720 }}>
            List the deliverables, drag them into the three packages, and the totals work themselves out. This is a first pass to react to: it stays in this browser only and sends nothing.
          </p>
        </div>
      </header>
      <ProposalBuilder />
    </div>
  )
}
