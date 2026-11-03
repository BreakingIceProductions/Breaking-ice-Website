import { adminFromRequest } from '@/admin/auth'
import { assetBytes, getQuote, pdfResponse } from '@/portal/quotes'

export const runtime = 'nodejs'

/** ?projectId=…[&signed=1][&download=1]: the quote PDF, or the signed copy with its certificate. */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return new Response('Signed out', { status: 401 })
  const u = new URL(req.url)
  const doc = await getQuote(u.searchParams.get('projectId') ?? '').catch(() => null)
  const signed = u.searchParams.get('signed') === '1'
  const ref = signed ? doc?.signature?.signedFile?.asset._ref : doc?.file?.asset._ref
  if (!doc || !ref) return new Response('Not found', { status: 404 })
  const base = (doc.fileName || 'Quote.pdf').replace(/\.pdf$/i, '')
  return pdfResponse(await assetBytes(ref), `${base}${signed ? '_Signed' : ''}.pdf`, u.searchParams.get('download') === '1')
}
