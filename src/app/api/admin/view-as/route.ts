import { NextResponse } from 'next/server'
import { adminFromRequest } from '@/admin/auth'
import { startPreview } from '@/portal/auth'

export const runtime = 'nodejs'

/** ?client=<id>&next=/portal/…: opens the client's portal as they see it (see startPreview). */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return NextResponse.redirect(new URL('/admin/sign-in', req.url))
  const u = new URL(req.url)
  const client = u.searchParams.get('client') ?? ''
  const next = u.searchParams.get('next') ?? '/portal'
  if (!/^[\w.-]+$/.test(client)) return NextResponse.redirect(new URL('/admin', req.url))
  await startPreview(client)
  return NextResponse.redirect(new URL(next.startsWith('/portal') && !next.startsWith('//') ? next : '/portal', req.url))
}
