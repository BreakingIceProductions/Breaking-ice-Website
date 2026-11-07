import { adminFromRequest } from '@/admin/auth'
import { addLog, getProject } from '@/admin/data'
import { portalClient } from '@/portal/data'
import { json } from '@/portal/http'
import { bookOnDeposit, createPayment, fmtCad, getPayment } from '@/portal/payments'

export const runtime = 'nodejs'

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * JSON { projectId, action, … }:
 *   portal-payments { on: boolean } — this project's client pays in the portal (or not)
 *   request { kind, label, amount } — ask the client for money
 *   cancel { id } — withdraw a request that hasn't been paid
 *   mark-paid { id } — paid some other way (e-transfer, cheque)
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const p = await getProject(text(body.projectId, 200))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)
  if (admin.sample) return json({ ok: true, sample: true })
  const action = text(body.action, 20)

  if (action === 'portal-payments') {
    await portalClient.patch(p.client._id).set({ portalPayments: Boolean(body.on) }).commit()
    await portalClient.patch(`drafts.${p.client._id}`).set({ portalPayments: Boolean(body.on) }).commit().catch(() => {})
    return json({ ok: true })
  }

  if (action === 'request') {
    const amount = Math.round(Number(String(body.amount ?? '').replace(/[$,\s]/g, '')) * 100) / 100
    if (!(amount > 0)) return json({ ok: false, message: 'Enter an amount.' }, 400)
    const kind = (['deposit', 'balance', 'other'] as const).find((k) => k === body.kind) ?? 'other'
    const label = text(body.label, 60) || (kind === 'deposit' ? 'Deposit' : kind === 'balance' ? 'Balance' : 'Payment')
    const existing = kind === 'deposit' ? await getPayment(`pay-${p._id}-deposit`) : null
    if (existing && existing.status !== 'canceled') return json({ ok: false, message: 'There’s already a deposit request. Cancel it first to ask again.' }, 409)
    if (existing) await portalClient.delete(existing._id)
    await createPayment({ projectId: p._id, clientId: p.client._id, kind, label, amount })
    await addLog(p._id, `Asked for ${label.toLowerCase()} in the portal: ${fmtCad(amount)}`, 'payment')
    return json({ ok: true })
  }

  const pay = await getPayment(text(body.id, 200))
  if (!pay || pay.projectId !== p._id) return json({ ok: false, error: 'not-found' }, 404)
  if (action === 'cancel') {
    if (pay.status !== 'due') return json({ ok: false, message: 'Only an unpaid request can be canceled. Refunds are done in Stripe.' }, 409)
    await portalClient.patch(pay._id).set({ status: 'canceled' }).commit()
    await addLog(p._id, `Canceled the ${pay.label.toLowerCase()} request`, 'payment')
    return json({ ok: true })
  }
  if (action === 'mark-paid') {
    if (pay.status === 'paid') return json({ ok: true })
    await portalClient.patch(pay._id).set({ status: 'paid', paidAt: new Date().toISOString(), method: 'outside' }).commit()
    await addLog(p._id, `${pay.label} marked paid outside the portal (${fmtCad(pay.total)})`, 'payment')
    await bookOnDeposit(pay).catch((e) => console.error('[admin] booking on deposit failed', e))
    return json({ ok: true })
  }
  return json({ ok: false, error: 'invalid' }, 400)
}
