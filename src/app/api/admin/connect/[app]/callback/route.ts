import { NextResponse } from 'next/server'
import { getAdminSession } from '@/admin/auth'
import { checkOAuth } from '@/admin/oauth'
import { ticktickExchange } from '@/admin/ticktick'
import { zohoExchange } from '@/admin/zoho'
import { rememberWisprError, wisprExchange, WisprError } from '@/admin/wispr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ app: string }> }

export async function GET(req: Request, { params }: Props) {
  const { app } = await params
  const url = new URL(req.url)
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings?${q}`, url), 303)
  const admin = await getAdminSession()
  if (!admin) return NextResponse.redirect(new URL('/admin/sign-in', url), 303)
  if (admin.viewOnly) return back('error=view-only')
  const code = url.searchParams.get('code')
  if (app === 'wispr' && !code && url.searchParams.get('error') && (await checkOAuth(app, url.searchParams.get('state') ?? ''))) {
    // Signed out of the Wispr page, or Wispr said no: say what it said.
    const why = (url.searchParams.get('error_description') || url.searchParams.get('error') || '').replace(/[^\w .,:;'()\-]/g, ' ').slice(0, 200)
    await rememberWisprError(`Wispr Flow didn’t allow this app to connect: ${why || 'access was denied'}.`)
    return back('error=wispr&app=wispr')
  }
  if (!code || !(await checkOAuth(app, url.searchParams.get('state') ?? ''))) return back(`error=denied&app=${encodeURIComponent(app)}`)
  try {
    if (app === 'ticktick') await ticktickExchange(code)
    else if (app === 'zoho') await zohoExchange(code)
    else if (app === 'wispr') await wisprExchange(code)
    else return back('error=unknown')
    return back(`connected=${app}`)
  } catch (e) {
    console.error(`[admin] ${app} connect failed`, e)
    if (app === 'wispr') {
      await rememberWisprError(e instanceof WisprError ? e.message : 'Wispr Flow didn’t allow this app to connect: saving the sign-in failed.')
      return back('error=wispr&app=wispr')
    }
    return back(`error=failed&app=${encodeURIComponent(app)}`)
  }
}
