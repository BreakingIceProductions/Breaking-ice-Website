import { NextResponse } from 'next/server'
import { stripeReady } from '@/portal/config'
import { settleSession } from '@/portal/payments'

export const runtime = 'nodejs'

/** Back from Stripe Checkout: record the payment right away (the webhook does too), then show it. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('session_id') ?? ''
  if (!stripeReady() || !/^cs_[A-Za-z0-9_]+$/.test(id)) return NextResponse.redirect(new URL('/portal', req.url), 303)
  try {
    const pay = await settleSession(id)
    const note = pay?.status === 'paid' ? 'paid' : pay?.status === 'processing' ? 'processing' : 'error'
    return NextResponse.redirect(new URL(`/portal/${pay?.slug ?? ''}?pay=${note}#billing`, req.url), 303)
  } catch (e) {
    console.error('[portal] payment return failed', e)
    return NextResponse.redirect(new URL('/portal?pay=error', req.url), 303)
  }
}
