import { NextResponse } from 'next/server'
import { getAdminSession } from '@/admin/auth'
import { googleOAuthReady } from '@/admin/config'
import { googleAuthorizeUrl } from '@/admin/gcal'
import { startOAuth } from '@/admin/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** "Connect" for Google calendars in Settings: off to Google to sign in and allow calendar access. Owner only. */
export async function GET(req: Request) {
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings?${q}`, req.url), 303)
  const admin = await getAdminSession()
  if (!admin) return NextResponse.redirect(new URL('/admin/sign-in', req.url), 303)
  if (admin.sample) return back('error=sample')
  if (admin.viewOnly) return back('error=view-only')
  if (!googleOAuthReady()) return back('error=not-set-up&app=google')
  return NextResponse.redirect(googleAuthorizeUrl(await startOAuth('google'), req.url), 303)
}
