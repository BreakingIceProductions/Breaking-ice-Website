import '../../../../css/admin-pages.css'
import { requireAdmin } from '@/admin/auth'
import { ProposalBuilder } from '@/admin/ui/proposal-builder'
import { PrintQuote } from './print-button'

export const metadata = { title: 'Quote builder' }

export default async function NewProposal() {
  await requireAdmin()
  return (
    <div className="a-page a-page-wide pb-page">
      <header className="a-head">
        <div className="stack ap-gap-3">
          <h1 className="a-h1">Quote builder</h1>
          <p className="muted m0 ap-measure">
            List the deliverables, put them into the three packages, and the totals add up for you. Your draft is saved in this browser only. Nothing is sent.
          </p>
        </div>
      </header>
      <p className="muted m0 pb-print-hint">Adjust takes a minus for a bundle discount, or a plus for travel and extras.</p>
      <ProposalBuilder />
      <PrintQuote />
    </div>
  )
}
