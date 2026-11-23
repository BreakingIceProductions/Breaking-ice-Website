import { NextResponse } from 'next/server'
import { getAdminSession } from '@/admin/auth'
import { googleExchange } from '@/admin/gcal'
import { checkOAuth } from '@/admin/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Google sends Josh back here after he allows calendar access. The state must match the one we set. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings?${q}`, url), 303)
  const admin = await getAdminSession()
  if (!admin) return NextResponse.redirect(new URL('/admin/sign-in', url), 303)
  if (admin.sample) return back('error=sample')
  if (admin.viewOnly) return back('error=view-only')
  const code = url.searchParams.get('code')
  if (!code || !(await checkOAuth('google', url.searchParams.get('state') ?? ''))) return back('error=denied&app=google')
  try {
    await googleExchange(code, req.url)
    return back('connected=google')
  } catch (e) {
    console.error('[admin] google connect failed', e)
    return back('error=failed&app=google')
  }
}
