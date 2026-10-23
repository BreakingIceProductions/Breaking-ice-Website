import { NextResponse } from 'next/server'
import { getAdminSession } from '@/admin/auth'
import { checkOAuth } from '@/admin/oauth'
import { ticktickExchange } from '@/admin/ticktick'
import { xeroExchange } from '@/admin/xero'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ app: string }> }

export async function GET(req: Request, { params }: Props) {
  const { app } = await params
  const url = new URL(req.url)
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings?${q}`, url), 303)
  if (!(await getAdminSession())) return NextResponse.redirect(new URL('/admin/sign-in', url), 303)
  const code = url.searchParams.get('code')
  if (!code || !(await checkOAuth(app, url.searchParams.get('state') ?? ''))) return back(`error=denied&app=${encodeURIComponent(app)}`)
  try {
    if (app === 'ticktick') await ticktickExchange(code)
    else if (app === 'xero') await xeroExchange(code)
    else return back('error=unknown')
    return back(`connected=${app}`)
  } catch (e) {
    console.error(`[admin] ${app} connect failed`, e)
    return back(`error=failed&app=${encodeURIComponent(app)}`)
  }
}
