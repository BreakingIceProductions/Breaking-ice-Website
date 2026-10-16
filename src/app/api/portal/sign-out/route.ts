import { NextResponse } from 'next/server'
import { endSession } from '@/portal/auth'
import { sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (sameOrigin(req)) await endSession()
  return NextResponse.redirect(new URL('/portal/sign-in?signed-out=1', req.url), 303)
}
