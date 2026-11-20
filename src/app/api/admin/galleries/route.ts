import { adminFromRequest } from '@/admin/auth'
import { driveOriginalsReady } from '@/galleries/drive'
import { day, docId, str } from '@/galleries/admin-input'
import { createGallery } from '@/galleries/store'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** New gallery from the list page's form. It starts as a draft with the share link off. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const title = str(body.title, 140)
  const date = body.date ? day(body.date) : ''
  const clientId = body.clientId ? docId(body.clientId) : ''
  const projectId = body.projectId ? docId(body.projectId) : ''
  if (!title || date === undefined || clientId === undefined || projectId === undefined) return json({ ok: false, error: 'invalid' }, 400)
  const g = await createGallery({ title, date: date || undefined, clientId: clientId || undefined, projectId: projectId || undefined, originals: driveOriginalsReady() ? 'drive' : 'r2' })
  return json({ ok: true, id: g._id })
}
