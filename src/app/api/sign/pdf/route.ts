import { pdfResponse } from '@/portal/quotes'
import { findByToken, signedName, signedPdf } from '@/portal/sign-store'

export const runtime = 'nodejs'

/** ?token=…: the signed copy, for whoever holds the signing link. &download=1 saves it. */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const r = await findByToken(u.searchParams.get('token') ?? '')
  if (!r?.signature || r.status !== 'signed') return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const bytes = await signedPdf(r)
  if (!bytes) return new Response('Not found', { status: 404 })
  const res = pdfResponse(bytes, signedName(r), u.searchParams.get('download') === '1')
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}
