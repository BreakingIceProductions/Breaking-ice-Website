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
  // The form sends clientIds: [clientId]; a bare clientId still works.
  const raw: unknown[] = Array.isArray(body.clientIds) ? body.clientIds.slice(0, 50) : body.clientId ? [body.clientId] : []
  const clientIds = raw.map(docId)
  const projectId = body.projectId ? docId(body.projectId) : ''
  if (!title || date === undefined || clientIds.some((c) => !c) || projectId === undefined) return json({ ok: false, error: 'invalid' }, 400)
  const g = await createGallery({ title, date: date || undefined, clientIds: clientIds as string[], projectId: projectId || undefined, originals: driveOriginalsReady() ? 'drive' : 'r2' })
  return json({ ok: true, id: g._id })
}
