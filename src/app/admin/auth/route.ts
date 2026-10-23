import { NextResponse } from 'next/server'
import { readAdminLink, startAdminSession } from '@/admin/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The button in the sign-in email lands here. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const email = await readAdminLink(url.searchParams.get('token') ?? '')
  if (!email) return NextResponse.redirect(new URL('/admin/sign-in?error=link', url), 303)
  await startAdminSession(email)
  return NextResponse.redirect(new URL('/admin', url), 303)
}
