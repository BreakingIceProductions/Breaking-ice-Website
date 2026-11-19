import { adminFromRequest } from '@/admin/auth'
import { addLog, getProject, setLead, setProjectType } from '@/admin/data'
import { today } from '@/admin/dates'
import { cleanLeadPatch, CONTACT_KINDS } from '@/admin/lead'
import { json } from '@/portal/http'
import { PROJECT_TYPES } from '@/sanity/portal/office-constants'

export const runtime = 'nodejs'

/**
 * The lead page's saves.
 * { projectId, patch } sets lead details on the office record (an empty string clears one);
 *   `projectType` in the patch goes to the project itself.
 * { projectId, contact: { kind, date, note } } adds a "Log contact" line to the activity log.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)

  if (body.contact) {
    const kind = CONTACT_KINDS.find((k) => k.value === body.contact.kind)
    const date = String(body.contact.date ?? '') || today()
    const note = String(body.contact.note ?? '').trim().slice(0, 200)
    if (!kind || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) return json({ ok: false, error: 'invalid' }, 400)
    if (admin.sample) return json({ ok: true, sample: true })
    // Logged for today keeps the time; an earlier day is filed at noon Mountain time, shown as a date only.
    await addLog(p._id, note ? `${kind.title}: ${note}` : kind.title, `contact-${kind.value}`, date === today() ? undefined : { at: `${date}T19:00:00.000Z`, day: true })
    return json({ ok: true })
  }

  const { projectType, ...rest } = (body.patch && typeof body.patch === 'object' ? body.patch : {}) as Record<string, unknown>
  const patch = cleanLeadPatch(rest)
  const type = projectType === undefined ? undefined : String(projectType)
  if (!patch || (type && !PROJECT_TYPES.some((t) => t.value === type)) || (type === undefined && !Object.keys(patch).length)) return json({ ok: false, error: 'invalid' }, 400)
  if (admin.sample) return json({ ok: true, sample: true })
  await setLead(p._id, patch)
  if (type !== undefined) await setProjectType(p._id, type)
  return json({ ok: true })
}
