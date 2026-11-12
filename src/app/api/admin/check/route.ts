import { adminFromRequest } from '@/admin/auth'
import { getProject, setOffice } from '@/admin/data'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** { projectId, key, done } from a board card: ticks one step of a stage's checklist on or off. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const key = String(body.key ?? '').slice(0, 60)
  const p = await getProject(String(body.projectId ?? ''))
  if (!p || !/^[a-z]+:\d+$/.test(key)) return json({ ok: false, error: 'not-found' }, 404)
  if (!admin.sample) {
    const rest = (p.office.checks ?? []).filter((k) => k !== key)
    await setOffice(p._id, { checks: body.done ? [...rest, key] : rest })
  }
  return json({ ok: true })
}
