import { NextResponse } from 'next/server'
import { adminFromRequest } from '@/admin/auth'
import { saveConnection } from '@/admin/data'

export const runtime = 'nodejs'

/** Form post from Settings. Forgets the saved token; reconnect any time. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  const form = await req.formData().catch(() => null)
  const app = String(form?.get('app') ?? '')
  if (admin && !admin.sample && (app === 'ticktick' || app === 'zoho')) await saveConnection(app, null)
  return NextResponse.redirect(new URL('/admin/settings?disconnected=1', req.url), 303)
}
