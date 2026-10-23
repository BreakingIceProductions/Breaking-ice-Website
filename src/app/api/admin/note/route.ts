import { adminFromRequest } from '@/admin/auth'
import { addNote, getProject } from '@/admin/data'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const text = String(body.text ?? '').trim()
  if (!text) return json({ ok: false, error: 'empty' }, 400)
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)
  await addNote(p._id, text)
  return json({ ok: true })
}
