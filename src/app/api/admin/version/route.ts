import { adminFromRequest } from '@/admin/auth'
import { addVersion, getProject, setVersion } from '@/admin/data'
import { addActivity } from '@/portal/data'
import { json } from '@/portal/http'
import { versionLabel } from '@/portal/library'

export const runtime = 'nodejs'

const STATUSES = ['in-progress', 'awaiting-feedback', 'changes-requested', 'approved'] as const

/** POST adds a video version (a Vimeo link). PATCH flips a version's switches. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim().slice(0, 140)
  const shareUrl = String(body.url ?? '').trim()
  if (!title || !/^https:\/\/(www\.|player\.)?vimeo\.com\/\S+$/i.test(shareUrl)) return json({ ok: false, error: 'invalid' }, 400)
  if (admin.sample) return json({ ok: true })
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false }, 404)
  const entry = await addVersion(p._id, { category: 'video', title, shareUrl, notes: String(body.notes ?? '').trim().slice(0, 2000) || undefined, send: body.send !== false })
  if (entry) await addActivity(p._id, `${entry.title}: Version ${entry.version} ${body.send !== false ? 'sent for review' : 'added'}`, 'version')
  return json({ ok: true, key: entry?._key })
}

export async function PATCH(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  if (admin.sample) return json({ ok: true })
  const p = await getProject(String(body.projectId ?? ''))
  const d = p?.deliverables.find((x) => x._key === body.key)
  if (!p || !d) return json({ ok: false }, 404)
  const fields = {
    clientCanView: typeof body.clientCanView === 'boolean' ? body.clientCanView : undefined,
    final: typeof body.final === 'boolean' ? body.final : undefined,
    status: STATUSES.find((s) => s === body.status),
  }
  await setVersion(p._id, d._key, fields)
  if (fields.final === true) await addActivity(p._id, `${d.title}: ${versionLabel(d)} marked Final`, 'approved')
  return json({ ok: true })
}
