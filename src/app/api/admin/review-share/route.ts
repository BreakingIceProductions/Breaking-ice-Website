import { adminFromRequest } from '@/admin/auth'
import { addLog, getProject } from '@/admin/data'
import { updateDeliverableState } from '@/portal/data'
import { json } from '@/portal/http'
import { versionLabel } from '@/portal/library'
import { newShareToken } from '@/portal/review'
import type { Deliverable } from '@/portal/types'

export const runtime = 'nodejs'

/**
 * A version's guest link: create it, switch it off or on, or replace it with a new one
 * (the old address stops working at once). Tokens are checked on every request.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')
  if (!['create', 'on', 'off', 'renew'].includes(action)) return json({ ok: false, error: 'invalid' }, 400)
  const p = await getProject(String(body.projectId ?? ''))
  const d = p?.deliverables.find((x) => x._key === body.key)
  if (!p || !d) return json({ ok: false }, 404)
  if (d.host !== 'r2') return json({ ok: false, error: 'not-in-room' }, 409)

  const now = new Date().toISOString()
  const cur = d.share
  const share: NonNullable<Deliverable['share']> =
    action === 'create' || action === 'renew' || !cur
      ? { token: newShareToken(), on: true, createdAt: now }
      : { ...cur, on: action === 'on' }
  if (admin.sample) return json({ ok: true, share, sample: true })
  await updateDeliverableState(p._id, d._key, { share })
  if (action !== 'on' && action !== 'off') await addLog(p._id, `Guest link ${action === 'renew' ? 'replaced' : 'made'} for ${d.title} (${versionLabel(d)})`)
  return json({ ok: true, share })
}
