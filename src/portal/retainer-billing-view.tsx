import { cad0, invoiceSchedule, monthName } from './retainer-quote'
import type { QuoteRetainer, RetainerChoice } from './types'

/**
 * After a retainer is signed: nothing due today, the invoice schedule, and how to pay.
 * Information only: invoices come from Zoho Books each month, so there are no pay buttons here.
 */
export function RetainerBilling({ choice, retainer, option, noGst, heading = 'How billing works' }: { choice: RetainerChoice; retainer?: QuoteRetainer; option?: string; noGst?: boolean; heading?: string }) {
  const tax = noGst ? '' : ' + GST'
  const rows = invoiceSchedule(choice)
  return (
    <section className="p-card rb" aria-labelledby="rb-h">
      <h2 id="rb-h" className="p-label">{heading}</h2>
      <p className="rb-due"><strong>Nothing is due today.</strong> Your first invoice comes in {monthName(choice.start)}.</p>
      <dl className="q-money rb-sum">
        {option && <div><dt>Option</dt><dd>{option}</dd></div>}
        <div><dt>Monthly{choice.buyout ? `, with ${retainer?.buyout?.name?.toLowerCase() ?? 'the buyout'}` : ''}{choice.archiveSpread ? `${choice.buyout ? ' and' : ', with'} the archive` : ''}</dt><dd>{cad0(choice.monthly)}{tax}</dd></div>
        {choice.archive && <div><dt>{retainer?.archive?.name ?? 'Archive licence'}, {choice.archiveSpread ? `spread monthly (${cad0(choice.archiveMonthly ?? 0)}/month)` : 'once'}</dt><dd>{cad0(choice.archiveTotal ?? 0)}{tax}</dd></div>}
        <div><dt>First invoice ({monthName(choice.start)})</dt><dd>{cad0(choice.first)}{tax}</dd></div>
        <div className="rb-year"><dt>The year</dt><dd>{cad0(choice.year)}{tax}</dd></div>
      </dl>
      <details className="rb-sched">
        <summary>All {choice.months} invoices</summary>
        <ol>
          {rows.map((r) => (
            <li key={r.month}><span>{r.month}{r.archive ? ' (includes the archive)' : ''}</span><span>{cad0(r.amount)}</span></li>
          ))}
        </ol>
      </details>
      <div className="rb-pay">
        <h3 className="p-label">How to pay each invoice</h3>
        <ul>
          <li><strong>e-Transfer or EFT</strong> (preferred). The details are on each invoice.</li>
          <li><strong>Credit card</strong> is accepted too, and adds a 3% processing fee.</li>
        </ul>
        <p className="muted small" style={{ margin: 0 }}>Travel is billed at cost on the next month’s invoice, itemized and approved in advance. Prices are before GST.</p>
      </div>
    </section>
  )
}
