import { adminFromRequest } from '@/admin/auth'
import { json } from '@/portal/http'
import { pdfResponse } from '@/portal/quotes'
import { hasWording } from '@/portal/sign-docs'
import { blankValues, buildDocPdf } from '@/portal/sign-pdf'
import { getRequest, getTemplate, signedName, signedPdf } from '@/portal/sign-store'

export const runtime = 'nodejs'
export const maxDuration = 30

/** ?template=<id>: a blank copy to print. ?request=<id>: the signed copy. Add &download=1 to save it. */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const u = new URL(req.url)
  const download = u.searchParams.get('download') === '1'
  const tid = u.searchParams.get('template')
  if (tid) {
    const t = await getTemplate(tid)
    if (!t) return json({ ok: false }, 404)
    if (!hasWording(t)) return json({ ok: false, message: 'This document has no wording yet.' }, 409)
    const bytes = await buildDocPdf({ title: t.title, body: t.body, fields: t.fields, values: blankValues(t.fields) })
    return pdfResponse(bytes, `${t.title} (blank).pdf`, download)
  }
  const r = await getRequest(u.searchParams.get('request') ?? '')
  if (!r?.signature) return json({ ok: false }, 404)
  const bytes = await signedPdf(r)
  if (!bytes) return json({ ok: false }, 404)
  return pdfResponse(bytes, signedName(r), download)
}
