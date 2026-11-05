import { adminFromRequest } from '@/admin/auth'
import { addLog, getProject } from '@/admin/data'
import { portalClient } from '@/portal/data'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** { projectId, archived } or { projectId, declined } → files a project into (or out of) the back office's Archived section, under Completed or Declined. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)
  if (admin.sample) return json({ ok: true, sample: true })
  if ('declined' in body) {
    const declined = Boolean(body.declined)
    await (declined ? portalClient.patch(p._id).set({ archived: true, declinedAt: new Date().toISOString() }) : portalClient.patch(p._id).set({ archived: false }).unset(['declinedAt'])).commit()
    await addLog(p._id, declined ? 'Archived as declined' : 'Unarchived', 'office')
    return json({ ok: true })
  }
  const archived = Boolean(body.archived)
  await (archived ? portalClient.patch(p._id).set({ archived }) : portalClient.patch(p._id).set({ archived }).unset(['declinedAt'])).commit()
  await addLog(p._id, archived ? 'Archived' : 'Unarchived', 'office')
  return json({ ok: true })
}
