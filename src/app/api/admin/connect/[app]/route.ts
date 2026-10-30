import { NextResponse } from 'next/server'
import { getAdminSession } from '@/admin/auth'
import { ticktickReady, zohoReady } from '@/admin/config'
import { startOAuth } from '@/admin/oauth'
import { ticktickAuthorizeUrl } from '@/admin/ticktick'
import { zohoAuthorizeUrl } from '@/admin/zoho'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ app: string }> }

/** "Connect" buttons in Settings: off to TickTick or Zoho Books to approve. */
export async function GET(req: Request, { params }: Props) {
  const { app } = await params
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings?${q}`, req.url), 303)
  const admin = await getAdminSession()
  if (!admin) return NextResponse.redirect(new URL('/admin/sign-in', req.url), 303)
  if (admin.sample) return back('error=sample')
  if (app === 'ticktick' && ticktickReady()) return NextResponse.redirect(ticktickAuthorizeUrl(await startOAuth(app)), 303)
  if (app === 'zoho' && zohoReady()) return NextResponse.redirect(zohoAuthorizeUrl(await startOAuth(app)), 303)
  return back(`error=not-set-up&app=${encodeURIComponent(app)}`)
}
