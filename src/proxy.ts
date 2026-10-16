import { NextResponse, type NextRequest } from 'next/server'

/**
 * Pre-launch lock: if SITE_PASSWORD is set, every page asks for a username
 * and password (browser pop-up). Unset SITE_PASSWORD on launch day.
 */
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD
  if (!password) return NextResponse.next()
  // Webhooks, the scheduler and the portal's own APIs check their own credentials.
  if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next()

  const user = process.env.SITE_USER || 'breakingice'
  const header = request.headers.get('authorization')
  if (header?.startsWith('Basic ')) {
    try {
      const [u, p] = atob(header.slice(6)).split(':')
      if (u === user && p === password) return NextResponse.next()
    } catch {
      // fall through to the challenge
    }
  }
  return new NextResponse('Breaking Ice: preview is private.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Breaking Ice preview", charset="UTF-8"' },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
