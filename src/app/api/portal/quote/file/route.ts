import { getSession } from '@/portal/auth'
import { getAccess } from '@/portal/data'
import { assetBytes, getQuote, pdfResponse, samplePdf } from '@/portal/quotes'

export const runtime = 'nodejs'

/** ?project=<slug>[&signed=1][&download=1]: the quote PDF, or the signed copy, for a client who can see it. */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const session = await getSession()
  if (!session) return new Response('Not found', { status: 404 })
  if (session.demo) return pdfResponse(await samplePdf(), 'Sample quote.pdf', u.searchParams.get('download') === '1')
  const q = (await getAccess(session)).quotes.find((x) => x.slug === u.searchParams.get('project'))
  if (!q) return new Response('Not found', { status: 404 })
  const doc = await getQuote(q.projectId)
  const signed = u.searchParams.get('signed') === '1'
  const ref = signed ? doc?.signature?.signedFile?.asset._ref : doc?.file?.asset._ref
  if (!doc || !ref) return new Response('Not found', { status: 404 })
  return pdfResponse(await assetBytes(ref), (doc.fileName || `${q.title} quote.pdf`).replace(/\.pdf$/i, '') + (signed ? '_Signed.pdf' : '.pdf'), u.searchParams.get('download') === '1')
}
