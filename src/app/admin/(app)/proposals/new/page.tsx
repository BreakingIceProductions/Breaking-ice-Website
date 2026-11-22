import '../../../../css/admin-pages.css'
import '../../../../css/admin-simple-a.css'
import '../../../../css/admin-simple-d.css'
import { HelpTip } from '@/admin/ui/help-tip'
import { requireAdmin } from '@/admin/auth'
import { ProposalBuilder } from '@/admin/ui/proposal-builder'
import { PrintQuote } from './print-button'

export const metadata = { title: 'Quote builder' }

export default async function NewProposal() {
  await requireAdmin()
  return (
    <div className="a-page a-page-wide pb-page">
      <header className="a-head">
        <div className="sd-head-row">
          <h1 className="a-h1 sa-h1">Quote builder</h1>
          <span className="sa-chips sd-tips">
            <span className="sa-chip" title="Your draft is saved in this browser only. Nothing is sent.">Saved on this computer</span>
            <HelpTip label="How the quote builder works">
              List the deliverables, price each one, then drag it into a package (on a touch screen, tap 1, 2 or 3). One deliverable can sit in more than one package, and the totals add up for you. Adjust takes a minus for a bundle discount, or a plus for travel and extras. “What the client sees” is the Investment page of the PDF, before tax. Your draft is saved in this browser only. Nothing is sent.
            </HelpTip>
          </span>
        </div>
      </header>
      <ProposalBuilder />
      <PrintQuote />
    </div>
  )
}
