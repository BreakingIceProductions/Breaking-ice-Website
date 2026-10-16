import { NextResponse } from 'next/server'
import { readLinkToken, startSession } from '@/portal/auth'
import { findClientsByEmail } from '@/portal/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The button in a sign-in or "new version" email lands here. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const t = await readLinkToken(url.searchParams.get('token') ?? '')
  if (!t || !(await findClientsByEmail(t.email)).length) {
    return NextResponse.redirect(new URL('/portal/sign-in?error=link', url), 303)
  }
  await startSession(t.email)
  return NextResponse.redirect(new URL(t.next, url), 303)
}
