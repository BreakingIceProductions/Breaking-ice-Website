import { NextResponse } from 'next/server'
import { getAdminSession } from '@/admin/auth'
import { ticktickReady, xeroReady } from '@/admin/config'
import { startOAuth } from '@/admin/oauth'
import { ticktickAuthorizeUrl } from '@/admin/ticktick'
import { xeroAuthorizeUrl } from '@/admin/xero'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ app: string }> }

/** "Connect" buttons in Settings: off to TickTick or Xero to approve. */
export async function GET(req: Request, { params }: Props) {
  const { app } = await params
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings?${q}`, req.url), 303)
  const admin = await getAdminSession()
  if (!admin) return NextResponse.redirect(new URL('/admin/sign-in', req.url), 303)
  if (admin.sample) return back('error=sample')
  if (app === 'ticktick' && ticktickReady()) return NextResponse.redirect(ticktickAuthorizeUrl(await startOAuth(app)), 303)
  if (app === 'xero' && xeroReady()) return NextResponse.redirect(xeroAuthorizeUrl(await startOAuth(app)), 303)
  return back(`error=not-set-up&app=${encodeURIComponent(app)}`)
}
