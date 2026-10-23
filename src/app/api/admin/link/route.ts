import { adminFromRequest } from '@/admin/auth'
import { addLink, getProject, removeLink } from '@/admin/data'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** Adds a document or link to a project (POST) or removes one (DELETE). The client sees it in the portal. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim().slice(0, 140)
  const url = String(body.url ?? '').trim()
  const note = String(body.note ?? '').trim().slice(0, 200)
  if (!title || !/^https:\/\/\S+$/i.test(url)) return json({ ok: false, error: 'invalid' }, 400)
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)
  await addLink(p._id, { title, url, ...(note ? { note } : {}) })
  return json({ ok: true })
}

export async function DELETE(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)
  await removeLink(p._id, String(body.key ?? ''))
  return json({ ok: true })
}
