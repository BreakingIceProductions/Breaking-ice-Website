import { NextResponse } from 'next/server'
import { getSession } from '@/portal/auth'
import { stripeReady } from '@/portal/config'
import { getAccess } from '@/portal/data'
import { limited, sameOrigin } from '@/portal/http'
import { BANK_METHODS } from '@/portal/pay-methods'
import { markSent, startCheckout } from '@/portal/payments'

export const runtime = 'nodejs'

// Redirects stay on the address they came from (the Vercel address now, the real domain later).
const back = (req: Request, path: string, note: string) => NextResponse.redirect(new URL(`${path}${path.includes('?') ? '&' : '?'}pay=${note}#billing`, req.url), 303)

/**
 * Form post { payment, back, how }. how = etransfer | eft: the client says it's on its way.
 * how = card: Stripe Checkout, with the processing fee added. Only for their own payments that are still due.
 */
export async function POST(req: Request) {
  const f = await req.formData().catch(() => null)
  const id = String(f?.get('payment') ?? '')
  const path = String(f?.get('back') ?? '/portal')
  const backPath = path.startsWith('/portal') ? path.split('#')[0] : '/portal'
  if (!sameOrigin(req)) return back(req, backPath, 'error')
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/portal/sign-in', req.url), 303)
  // The sample and the back office's client view never take real money.
  if (session.demo) return back(req, backPath, 'sample')
  if (session.preview) return back(req, backPath, 'preview')
  const how = String(f?.get('how') ?? 'card')
  const bank = BANK_METHODS.find((m) => m === how)
  if (!bank && !stripeReady()) return back(req, backPath, 'off')
  if (limited(`pay:${session.email}`, 20, 60 * 60_000)) return back(req, backPath, 'error')
  const access = await getAccess(session)
  const pay = access.payments.find((p) => p._id === id)
  if (!pay || pay.status !== 'due') return back(req, backPath, 'error')
  if (bank) {
    await markSent(pay, bank).catch((e) => console.error('[portal] mark sent failed', e))
    return back(req, backPath, 'sent')
  }
  try {
    const org = access.clients.find((c) => c._id === pay.clientId)?.organizationName ?? ''
    const url = await startCheckout(pay, { email: session.email, org }, new URL(req.url).origin, backPath)
    return NextResponse.redirect(url, 303)
  } catch (e) {
    console.error('[portal] checkout failed', e)
    return back(req, backPath, 'error')
  }
}
