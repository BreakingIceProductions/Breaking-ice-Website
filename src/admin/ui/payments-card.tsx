'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { PortalPayment } from '@/portal/types'

type Props = {
  projectId: string
  /** The client pays in the portal. */
  on: boolean
  payments: PortalPayment[]
  /** Quote total less the deposit, offered as the balance. */
  balance?: number
  deposit?: number
  stripeOn: boolean
  testMode: boolean
  gst: boolean
}

const cad = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' }) : '')
const STATUS: Record<PortalPayment['status'], { tone: string; text: string }> = {
  due: { tone: 'awaiting-feedback', text: 'Waiting for payment' },
  processing: { tone: 'in-progress', text: 'Bank debit clearing' },
  paid: { tone: 'approved', text: 'Paid' },
  canceled: { tone: 'in-progress', text: 'Canceled' },
}

/** Ask for a deposit or balance in the client's portal, and see what's been paid. */
export function PaymentsCard({ projectId, on, payments, balance, deposit, stripeOn, testMode, gst }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; err?: boolean }>()
  const hasDeposit = payments.some((p) => p.kind === 'deposit' && p.status !== 'canceled')
  const [kind, setKind] = useState<'deposit' | 'balance' | 'other'>(hasDeposit ? 'balance' : 'deposit')
  const suggested = kind === 'balance' ? balance : kind === 'deposit' ? deposit : undefined
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')

  async function call(body: Record<string, unknown>, done: string) {
    setBusy(true)
    setMsg(undefined)
    const r = await fetch('/api/admin/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...body }) }).catch(() => null)
    const j = await r?.json().catch(() => null)
    setBusy(false)
    if (!r?.ok || !j?.ok) return setMsg({ text: j?.message ?? 'That didn’t work. Try again.', err: true })
    setMsg({ text: j.sample ? 'Sample mode: nothing was saved.' : done })
    setAmount('')
    setLabel('')
    router.refresh()
  }

  return (
    <section className="p-card" aria-labelledby="h-pay">
      <div className="a-card-head">
        <h2 id="h-pay" className="a-h2">Portal payments</h2>
        {on && testMode && <span className="pill pill-in-progress">Stripe test mode</span>}
      </div>

      {!on ? (
        <>
          <p className="muted small" style={{ margin: 0 }}>This client is invoiced outside the portal (QuickBooks), so they see no pay buttons.</p>
          <div><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => call({ action: 'portal-payments', on: true }, 'This client now pays in the portal.')}>Take payments in the portal</button></div>
        </>
      ) : (
        <>
          {payments.length > 0 ? (
            <ul className="a-pay-list">
              {payments.map((p) => (
                <li key={p._id}>
                  <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <strong>{p.label} · {cad(p.total)}</strong>
                    <span className="muted small">
                      {p.gst ? `${cad(p.amount)} + ${cad(p.gst)} GST · ` : ''}
                      {p.status === 'paid' ? `Paid ${day(p.paidAt)}${p.method === 'outside' ? ' (outside the portal)' : p.method === 'acss_debit' ? ' by bank debit' : p.method === 'card' ? ' by card' : ''}` : `Asked ${day(p.createdAt)}`}
                    </span>
                  </span>
                  <span className={`pill pill-${STATUS[p.status].tone}`}>{STATUS[p.status].text}</span>
                  {p.status === 'due' && (
                    <span className="row-wrap" style={{ gap: 'var(--space-3)' }}>
                      <button type="button" className="linklike small" disabled={busy} onClick={() => confirm(`Mark ${p.label.toLowerCase()} (${cad(p.total)}) as paid some other way?`) && call({ action: 'mark-paid', id: p._id }, 'Marked paid.')}>Mark paid</button>
                      <button type="button" className="linklike small" disabled={busy} onClick={() => confirm(`Withdraw the ${p.label.toLowerCase()} request?`) && call({ action: 'cancel', id: p._id }, 'Request withdrawn.')}>Cancel</button>
                    </span>
                  )}
                  {p.receiptUrl && <a className="text-link small" href={p.receiptUrl} target="_blank" rel="noopener noreferrer">Receipt</a>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Nothing asked for yet. Signing the quote asks for the deposit automatically.</p>
          )}

          <form
            className="a-pay-form"
            onSubmit={(e) => {
              e.preventDefault()
              call({ action: 'request', kind, label, amount: amount || suggested }, 'Added. The client sees it in their portal.')
            }}
          >
            <div className="field">
              <label htmlFor="pay-kind">Ask for</label>
              <select id="pay-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="deposit" disabled={hasDeposit}>Deposit</option>
                <option value="balance">Balance</option>
                <option value="other">Something else</option>
              </select>
            </div>
            {kind === 'other' && (
              <div className="field">
                <label htmlFor="pay-label">Label</label>
                <input id="pay-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Extra shoot day" maxLength={60} required />
              </div>
            )}
            <div className="field">
              <label htmlFor="pay-amt">Amount, before GST</label>
              <input id="pay-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={suggested ? String(suggested) : '2500'} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !(amount || suggested)}>{busy ? 'Saving…' : 'Ask in the portal'}</button>
          </form>
          <p className="muted small" style={{ margin: 0 }}>
            {!stripeOn ? 'Stripe isn’t connected yet, so the client sees the amount but can’t pay online. ' : ''}
            {gst ? '5% GST is added at checkout.' : 'No GST is added (no GST number in the portal settings).'} The client gets no email for a new request; tell them, or it shows on their portal home.
          </p>
          <div><button type="button" className="linklike small" disabled={busy} onClick={() => confirm('Stop taking payments in the portal for this client? Unpaid requests stay hidden from them.') && call({ action: 'portal-payments', on: false }, 'Portal payments switched off for this client.')}>Switch off portal payments for this client</button></div>
        </>
      )}
      <p className={`small ${msg?.err ? 'err' : 'muted'}`} role="status" style={{ margin: 0 }}>{msg?.text}</p>
    </section>
  )
}
