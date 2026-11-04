import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { SITE_URL } from '@/lib/site'
import { addLog } from '@/admin/data'
import { portalEnv, portalReady, stripeReady } from './config'
import { addActivity, getPortalSettings, portalClient } from './data'
import { notifyJosh, paidEmail, sendEmail } from './email'
import type { PortalPayment, PortalSettings } from './types'

/**
 * Deposits and balances paid in the portal. Each request for money is a `portalPayment`
 * document; paying it opens Stripe Checkout, and Stripe's reply (the webhook, or the
 * return trip from Checkout) marks it paid. Only clients with portalPayments on use this.
 */

const FIELDS = `_id, projectId, clientId, kind, label, amount, gst, total, status, createdAt, paidAt, method, receiptUrl,
  "slug": *[_type == "clientProject" && _id == ^.projectId][0].slug.current,
  "projectTitle": *[_type == "clientProject" && _id == ^.projectId][0].title`

const cents = (n: number) => Math.round(n * 100)
export const round2 = (n: number) => Math.round(n * 100) / 100
export const fmtCad = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** GST is only added when the company's GST number is set in the portal settings. */
export const gstFor = (amount: number, settings: Pick<PortalSettings, 'gstNumber'>) => (settings.gstNumber ? round2(amount * 0.05) : 0)

export async function paymentsForClients(clientIds: string[]): Promise<PortalPayment[]> {
  if (!portalReady() || !clientIds.length) return []
  return (await portalClient.fetch<PortalPayment[]>(`*[_type == "portalPayment" && clientId in $ids && status != "canceled"] | order(createdAt asc){${FIELDS}}`, { ids: clientIds })) ?? []
}

export async function paymentsForProject(projectId: string): Promise<PortalPayment[]> {
  if (!portalReady()) return []
  return (await portalClient.fetch<PortalPayment[]>(`*[_type == "portalPayment" && projectId == $id] | order(createdAt asc){${FIELDS}}`, { id: projectId })) ?? []
}

export async function getPayment(id: string) {
  return portalClient.fetch<(PortalPayment & { _rev: string; sessionId?: string }) | null>(`*[_type == "portalPayment" && _id == $id][0]{..., ${FIELDS}}`, { id })
}

/** Asks for money. The deposit has a fixed id, so signing twice can't ask twice. */
export async function createPayment(p: { projectId: string; clientId: string; kind: PortalPayment['kind']; label: string; amount: number }) {
  const settings = await getPortalSettings()
  const amount = round2(p.amount)
  const gst = gstFor(amount, settings)
  const _id = p.kind === 'deposit' ? `pay-${p.projectId}-deposit` : `pay-${p.projectId}-${Date.now().toString(36)}`
  const doc = { _id, _type: 'portalPayment', projectId: p.projectId, clientId: p.clientId, kind: p.kind, label: p.label, amount, gst, total: round2(amount + gst), status: 'due', createdAt: new Date().toISOString() }
  return portalClient.createIfNotExists(doc)
}

/* ── Stripe (plain REST, no SDK) ───────────────────────────────────────── */

type Params = Record<string, unknown>
function form(params: Params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item as Params, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))))
    else if (typeof v === 'object') form(v as Params, key, out)
    else out.append(key, String(v))
  }
  return out
}

async function stripe<T>(path: string, params?: Params, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const body = params ? form(params) : undefined
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${portalEnv.stripeSecret}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? body : undefined,
    cache: 'no-store',
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`Stripe ${path}: ${j?.error?.message ?? r.status}`)
  return j as T
}

export const stripeTestMode = () => portalEnv.stripeSecret.startsWith('sk_test_') || portalEnv.stripeSecret.startsWith('rk_test_')

type CheckoutSession = {
  id: string
  url?: string
  status: 'open' | 'complete' | 'expired'
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  metadata?: Record<string, string>
  payment_intent?: { id: string; payment_method_types?: string[]; latest_charge?: { receipt_url?: string; payment_method_details?: { type?: string } } } | string | null
}

/** Opens Stripe Checkout for one payment. Card and Canadian bank debit, as turned on in the Stripe Dashboard. */
export async function startCheckout(p: PortalPayment, who: { email: string; org: string }, origin: string, backPath: string) {
  if (!stripeReady()) throw new Error('stripe-off')
  const what = `${p.label} · ${p.projectTitle ?? 'Project'}`
  const items: Params[] = [{ quantity: 1, price_data: { currency: 'cad', unit_amount: cents(p.amount), product_data: { name: what } } }]
  if (p.gst) items.push({ quantity: 1, price_data: { currency: 'cad', unit_amount: cents(p.gst), product_data: { name: 'GST (5%)' } } })
  const s = await stripe<CheckoutSession>('checkout/sessions', {
    mode: 'payment',
    line_items: items,
    customer_email: who.email,
    client_reference_id: p._id,
    metadata: { paymentId: p._id, projectId: p.projectId },
    payment_intent_data: { description: `${what} · ${who.org}`, metadata: { paymentId: p._id, projectId: p.projectId }, receipt_email: who.email },
    success_url: `${origin}/api/portal/pay/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${backPath}`,
  })
  await portalClient.patch(p._id).set({ sessionId: s.id }).commit()
  return s.url!
}

/**
 * Records what happened in Checkout. Safe to call more than once (the webhook and the
 * return trip both do): the side effects run only when the status actually changes.
 */
export async function settleSession(sessionId: string): Promise<PortalPayment | null> {
  const s = await stripe<CheckoutSession>(`checkout/sessions/${sessionId}`, { expand: ['payment_intent.latest_charge'] }, 'GET')
  const id = s.metadata?.paymentId
  if (!id) return null
  const pay = await getPayment(id)
  if (!pay) return null
  const pi = typeof s.payment_intent === 'object' ? s.payment_intent : null
  const next: PortalPayment['status'] | null = s.payment_status === 'paid' ? 'paid' : s.status === 'complete' ? 'processing' : null
  if (!next || pay.status === next || pay.status === 'paid' || pay.status === 'canceled') return pay
  const method = pi?.latest_charge?.payment_method_details?.type ?? pi?.payment_method_types?.[0]
  const receiptUrl = pi?.latest_charge?.receipt_url
  try {
    await portalClient
      .patch(pay._id)
      .ifRevisionId(pay._rev)
      .set({ status: next, sessionId, ...(next === 'paid' ? { paidAt: new Date().toISOString() } : {}), ...(method ? { method } : {}), ...(receiptUrl ? { receiptUrl } : {}), ...(pi ? { paymentIntent: pi.id } : {}) })
      .commit()
  } catch {
    // Someone else (the webhook or the return trip) recorded it first.
    return getPayment(id)
  }
  await announce({ ...pay, status: next, receiptUrl }, next === 'processing')
  return { ...pay, status: next }
}

/** A failed bank debit puts the payment back to due. */
export async function failSession(sessionId: string) {
  const s = await stripe<CheckoutSession>(`checkout/sessions/${sessionId}`, undefined, 'GET')
  const pay = s.metadata?.paymentId ? await getPayment(s.metadata.paymentId) : null
  if (!pay || pay.status === 'paid') return
  await portalClient.patch(pay._id).set({ status: 'due' }).commit()
  await addLog(pay.projectId, `${pay.label} bank payment failed; it’s due again`, 'payment')
  await notifyJosh(`⚠️ Bank payment failed: ${pay.label} · ${pay.projectTitle} (${fmtCad(pay.total)}). ${SITE_URL}/admin/projects/${pay.projectId}`)
}

async function announce(pay: PortalPayment, processing: boolean) {
  const amount = fmtCad(pay.total)
  if (!processing) await addActivity(pay.projectId, `${pay.label} paid`, 'approved')
  await addLog(pay.projectId, processing ? `${pay.label} (${amount}) paid by bank debit; clearing` : `${pay.label} paid: ${amount}${pay.method && pay.method !== 'card' ? ` (${pay.method === 'acss_debit' ? 'bank debit' : pay.method})` : ''}`, 'payment')
  await notifyJosh(`${processing ? '⏳' : '💸'} ${pay.label} ${processing ? 'started by bank debit' : 'paid'}: ${amount} · ${pay.projectTitle}. ${SITE_URL}/admin/projects/${pay.projectId}`)
  try {
    const settings = await getPortalSettings()
    const client = await portalClient.fetch<{ organizationName: string; contacts?: { name: string; email: string; getsEmails?: boolean }[] } | null>(`*[_id == $id][0]{organizationName, contacts}`, { id: pay.clientId })
    const to = (client?.contacts ?? []).filter((c) => c.email && c.getsEmails !== false)
    for (const c of to) {
      await sendEmail({
        to: [c.email],
        bcc: settings.copyTo ? [settings.copyTo] : undefined,
        ...paidEmail({ name: c.name.split(' ')[0], projectTitle: pay.projectTitle ?? 'your project', org: client!.organizationName, label: pay.label, total: pay.total, processing, receiptUrl: pay.receiptUrl, portalUrl: `${SITE_URL}/portal/${pay.slug ?? ''}#billing`, signOff: settings.signOff }),
      })
    }
  } catch (e) {
    console.error('[portal] payment email failed', e)
  }
}

/** Checks the Stripe-Signature header (v1 scheme, 5-minute tolerance). */
export function verifyWebhook(payload: string, header: string | null) {
  const secret = portalEnv.stripeWebhookSecret
  if (!secret || !header) return false
  const parts = Object.fromEntries(header.split(',').map((x) => x.split('=') as [string, string]).filter(([k]) => k === 't')) as { t?: string }
  const sigs = header.split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3))
  if (!parts.t || !sigs.length || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex')
  return sigs.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
}
