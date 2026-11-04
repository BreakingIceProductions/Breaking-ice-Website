import { failSession, settleSession, verifyWebhook } from '@/portal/payments'

export const runtime = 'nodejs'

/**
 * Stripe → us. Listens for checkout.session.completed, .async_payment_succeeded and
 * .async_payment_failed (bank debits clear days later). Re-reads the session from
 * Stripe rather than trusting the event body.
 */
export async function POST(req: Request) {
  const payload = await req.text()
  if (!verifyWebhook(payload, req.headers.get('stripe-signature'))) return new Response('bad signature', { status: 400 })
  const event = JSON.parse(payload) as { type: string; data: { object: { id: string; object: string } } }
  const obj = event.data.object
  if (obj.object !== 'checkout.session') return new Response('ignored')
  try {
    if (event.type === 'checkout.session.async_payment_failed') await failSession(obj.id)
    else if (event.type.startsWith('checkout.session.')) await settleSession(obj.id)
  } catch (e) {
    console.error('[stripe] webhook failed', e)
    return new Response('retry', { status: 500 })
  }
  return new Response('ok')
}
