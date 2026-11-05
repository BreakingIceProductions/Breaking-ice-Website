import { getPortalSettings } from './data'
import { methodLabel } from './pay-methods'
import { cardFeeFor, payReference } from './payments'
import type { PortalPayment } from './types'
import { fmtDate } from './ui'

const cad = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const NOTES: Record<string, { text: string; err?: boolean }> = {
  paid: { text: 'Thanks, your payment is in. A confirmation is on its way by email.' },
  sent: { text: 'Thanks for letting us know. It’ll show as paid here once it lands: e-Transfers usually arrive the same day, EFTs in one to three business days.' },
  processing: { text: 'Thanks, your payment is on its way. It’ll show as paid here once it clears.' },
  sample: { text: 'This is the sample project, so nothing is sent or charged.' },
  preview: { text: 'Payments are off while you’re viewing as the client.' },
  off: { text: 'Card payment isn’t switched on yet. Please use e-Transfer or EFT.', err: true },
  error: { text: 'That didn’t go through and nothing was charged. Try again, or reply to any of our emails and we’ll sort it out.', err: true },
}

const day = (iso?: string) => fmtDate(iso, { month: 'short', day: 'numeric', year: 'numeric' })

/**
 * What's been asked for on a project. For anything due: e-Transfer and EFT details first
 * (no fees), then card as the fallback, with the processing fee shown before they choose it.
 */
export async function PaymentList({ payments, back, note, heading = 'Payments', id }: { payments: PortalPayment[]; back: string; note?: string; heading?: string; id?: string }) {
  if (!payments.length) return null
  const real = await getPortalSettings()
  // The sample project is public (the demo on the sign-in page), so it never shows the real bank details.
  const sample = payments.every((p) => p._id.startsWith('sample-'))
  const settings = sample ? { ...real, etransferEmail: 'payments@example.com', eftDetails: 'Account: Breaking Ice Productions\nInstitution 000 · Transit 00000\nAccount 0000000\n(Real projects show the real details.)' } : real
  const msg = note ? NOTES[note] : undefined
  const due = payments.filter((p) => p.status === 'due')
  const bankWays = Boolean(settings.etransferEmail || settings.eftDetails)

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
                  ? `Paid ${day(p.paidAt)}${p.method && p.method !== 'outside' ? ` by ${methodLabel(p.method)}` : ''}${p.cardFee ? `, incl. ${cad(p.cardFee + (p.cardFeeGst ?? 0))} card fee` : ''}`
                  : p.status === 'processing'
                    ? `${methodLabel(p.method) || 'Payment'} on its way`
                    : p.gst ? `${cad(p.amount)} + ${cad(p.gst)} GST` : 'Due now'}
              </span>
            </div>
            <span className="pay-amount">{cad(p.status === 'paid' && p.cardFee ? p.total + p.cardFee + (p.cardFeeGst ?? 0) : p.total)}</span>
            {p.status === 'due' ? (
              <span className="pill pill-awaiting-feedback">Due</span>
            ) : p.status === 'paid' ? (
              p.receiptUrl ? <a className="text-link small" href={p.receiptUrl} target="_blank" rel="noopener noreferrer">Receipt<span className="sr-only"> for {p.label} (opens Stripe)</span></a> : <span className="pill pill-approved">Paid</span>
            ) : (
              <span className="pill pill-in-progress">Sent</span>
            )}
          </li>
        ))}
      </ul>

      {due.map((p) => {
        const fee = cardFeeFor(p, settings)
        const ref = payReference(p)
        return (
          <div key={p._id} className="pay-how">
            <h3 className="pay-how-h">{due.length > 1 ? `Paying the ${p.label.toLowerCase()} (${cad(p.total)})` : 'How to pay'}</h3>
            {bankWays ? (
              <>
                <p className="small" style={{ margin: 0 }}>
                  e-Transfer or EFT is best: no fees. Put <strong>{ref}</strong> in the message so we can match it.
                </p>
                <div className="pay-ways">
                  {settings.etransferEmail && (
                    <div className="pay-way">
                      <span className="p-label">Interac e-Transfer</span>
                      <span>Send {cad(p.total)} to <strong className="pay-copy">{settings.etransferEmail}</strong></span>
                    </div>
                  )}
                  {settings.eftDetails && (
                    <div className="pay-way">
                      <span className="p-label">EFT / direct deposit</span>
                      <span className="pay-eft">{settings.eftDetails}</span>
                    </div>
                  )}
                </div>
                <form action="/api/portal/pay" method="post" className="row-wrap" style={{ gap: 'var(--space-2)' }}>
                  <input type="hidden" name="payment" value={p._id} />
                  <input type="hidden" name="back" value={back} />
                  {settings.etransferEmail && <button type="submit" name="how" value="etransfer" className="btn btn-primary btn-sm">I’ve sent the e-Transfer</button>}
                  {settings.eftDetails && <button type="submit" name="how" value="eft" className={`btn btn-sm ${settings.etransferEmail ? 'btn-secondary' : 'btn-primary'}`}>I’ve sent the EFT</button>}
                </form>
              </>
            ) : (
              <p className="small" style={{ margin: 0 }}>To pay by e-Transfer or EFT (no fees), reply to any of our emails and we’ll send the details.</p>
            )}
            <details className="pay-card-opt" open={!bankWays}>
              <summary className="small">Pay by credit card instead</summary>
              <p className="muted small" style={{ margin: 'var(--space-2) 0' }}>
                {fee.fee
                  ? `Card payments add a ${fee.pct}% processing fee (${cad(fee.fee)}${fee.gst ? ` + ${cad(fee.gst)} GST` : ''}), so the total is ${cad(p.total + fee.added)}. You pay on Stripe’s secure page.`
                  : 'You pay on Stripe’s secure page.'}
              </p>
              <form action="/api/portal/pay" method="post">
                <input type="hidden" name="payment" value={p._id} />
                <input type="hidden" name="back" value={back} />
                <button type="submit" name="how" value="card" className="btn btn-secondary btn-sm">Pay {cad(p.total + fee.added)} by card<span className="sr-only"> for the {p.label.toLowerCase()}</span></button>
              </form>
            </details>
          </div>
        )
      })}
    </section>
  )
}
