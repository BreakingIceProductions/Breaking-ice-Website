import { adminFromRequest } from '@/admin/auth'
import { addVersion, getProject, removeVersion, setVersion } from '@/admin/data'
import { driveReady } from '@/portal/config'
import { trashProjectFile } from '@/portal/drive'
import { googleFile } from '@/portal/links'
import type { ClientProject } from '@/portal/types'
import { addActivity } from '@/portal/data'
import { json } from '@/portal/http'
import { versionLabel } from '@/portal/library'
import { deleteObject, r2Ready } from '@/portal/r2'

export const runtime = 'nodejs'

const STATUSES = ['in-progress', 'awaiting-feedback', 'changes-requested', 'approved'] as const

/** POST adds a video version (a Vimeo link). PATCH flips a version's switches. DELETE removes a version. */
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

/** Removes a version from the project. Its file, if it's in the project's Drive folder, goes to Drive's trash; a review copy in R2 is deleted. A Vimeo video is left alone. */
export async function DELETE(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  if (admin.sample) return json({ ok: true })
  const p = await getProject(String(body.projectId ?? ''))
  const d = p?.deliverables.find((x) => x._key === body.key)
  if (!p || !d) return json({ ok: false }, 404)
  await removeVersion(p._id, d._key)
  let trashed = false
  const file = d.fileUrl ? googleFile(d.fileUrl) : null
  if (file && driveReady()) trashed = await trashProjectFile(p as unknown as ClientProject, file.id).catch((e) => (console.error('[admin] trash failed', e), false))
  // A review copy in our storage goes too, with its thumbnail (nothing else points at them).
  if (d.r2Key && !d.r2Key.startsWith('sample/') && r2Ready()) await deleteObject(d.r2Key).catch((e) => console.error('[admin] r2 delete failed', e))
  if (d.r2Thumb && !d.r2Thumb.startsWith('sample/') && r2Ready()) await deleteObject(d.r2Thumb).catch((e) => console.error('[admin] r2 thumb delete failed', e))
  await addActivity(p._id, `${d.title}: ${versionLabel(d)} deleted`, 'version')
  return json({ ok: true, trashed })
}
