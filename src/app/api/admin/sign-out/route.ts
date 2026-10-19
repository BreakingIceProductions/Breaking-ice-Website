import { NextResponse } from 'next/server'
import { endAdminSession } from '@/admin/auth'
import { sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (sameOrigin(req)) await endAdminSession()
  return NextResponse.redirect(new URL('/admin/sign-in?signed-out=1', req.url), 303)
}
