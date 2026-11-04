import type { PortalPayment } from './types'
import { fmtDate } from './ui'

const cad = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const NOTES: Record<string, { text: string; err?: boolean }> = {
  paid: { text: 'Thanks, your payment is in. A confirmation is on its way by email.' },
  processing: { text: 'Thanks, your bank payment is on its way. Bank debits take a few business days to clear; it’ll show as paid here when it does.' },
  sample: { text: 'This is the sample project, so no payment page opens.' },
  preview: { text: 'Payments are off while you’re viewing as the client.' },
  off: { text: 'Online payment isn’t switched on yet. We’ll send you an invoice instead.', err: true },
  error: { text: 'That payment didn’t go through and nothing was charged. Try again, or reply to any of our emails and we’ll sort it out.', err: true },
}

/** What's been asked for on a project, with a Pay button for anything due. */
export function PaymentList({ payments, back, note, heading = 'Payments', id }: { payments: PortalPayment[]; back: string; note?: string; heading?: string; id?: string }) {
  if (!payments.length) return null
  const msg = note ? NOTES[note] : undefined
  return (
    <section id={id} className="p-card p-anchor pay-card" aria-labelledby={`${id ?? 'pay'}-h`}>
      <h2 id={`${id ?? 'pay'}-h`} className="p-label">{heading}</h2>
      {msg && <p className={`small pay-note${msg.err ? ' err' : ''}`} role="status">{msg.text}</p>}
      <ul className="pay-list">
        {payments.map((p) => (
          <li key={p._id} className={`pay-row pay-${p.status}`}>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <strong>{p.label}</strong>
              <span className="muted small">
                {p.status === 'paid'
                  ? `Paid ${fmtDate(p.paidAt, { month: 'short', day: 'numeric', year: 'numeric' })}${p.method === 'acss_debit' ? ' by bank debit' : p.method === 'card' ? ' by card' : ''}`
                  : p.status === 'processing'
                    ? 'Bank payment clearing'
                    : p.gst ? `${cad(p.amount)} + ${cad(p.gst)} GST` : 'Due now'}
              </span>
            </div>
            <span className="pay-amount">{cad(p.total)}</span>
            {p.status === 'due' ? (
              <form action="/api/portal/pay" method="post">
                <input type="hidden" name="payment" value={p._id} />
                <input type="hidden" name="back" value={back} />
                <button type="submit" className="btn btn-primary btn-sm">Pay<span className="sr-only"> {p.label}, {cad(p.total)}</span></button>
              </form>
            ) : p.status === 'paid' ? (
              p.receiptUrl ? <a className="text-link small" href={p.receiptUrl} target="_blank" rel="noopener noreferrer">Receipt<span className="sr-only"> for {p.label} (opens Stripe)</span></a> : <span className="pill pill-approved">Paid</span>
            ) : (
              <span className="pill pill-awaiting-feedback">Clearing</span>
            )}
          </li>
        ))}
      </ul>
      {payments.some((p) => p.status === 'due') && <p className="muted small" style={{ margin: 0 }}>Pay by card or straight from your bank account on Stripe’s secure page.</p>}
    </section>
  )
}
