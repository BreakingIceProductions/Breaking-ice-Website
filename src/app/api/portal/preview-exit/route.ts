import { NextResponse } from 'next/server'
import { endPreview } from '@/portal/auth'
import { sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

/** Leaves "view as client" and goes back to the back office. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 })
  await endPreview()
  return NextResponse.redirect(new URL('/admin', req.url), 303)
}
