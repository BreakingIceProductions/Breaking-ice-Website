import { adminFromRequest } from '@/admin/auth'
import { getProject, setOffice } from '@/admin/data'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** { projectId, key } from the dashboard: hides that one reminder. A new one for the same project still shows. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const key = String(body.key ?? '').slice(0, 200)
  const p = await getProject(String(body.projectId ?? ''))
  if (!p || !key) return json({ ok: false, error: 'not-found' }, 404)
  if (!admin.sample && !(p.office.dismissed ?? []).includes(key)) {
    await setOffice(p._id, { dismissed: [...(p.office.dismissed ?? []), key].slice(-60) })
  }
  return json({ ok: true })
}
