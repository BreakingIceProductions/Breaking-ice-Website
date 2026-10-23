import { adminFromRequest } from '@/admin/auth'
import { addReviewFile, getProject } from '@/admin/data'
import { addActivity } from '@/portal/data'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** After back-office uploads: note them on the project and, if asked, send them to the client for review. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  if (admin.sample) return json({ ok: true })
  const body = await req.json().catch(() => ({}))
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false }, 404)
  const files: { id: string; name: string }[] = (Array.isArray(body.files) ? body.files : [])
    .slice(0, 50)
    .map((f: { id?: string; name?: string }) => ({ id: String(f?.id ?? ''), name: String(f?.name ?? '').slice(0, 200) }))
    .filter((f: { id: string; name: string }) => f.id && f.name)
  if (!files.length) return json({ ok: false }, 400)
  const folder = body.folder === 'Finals' ? 'Finals' : 'From Breaking Ice'
  const what = files.length === 1 ? files[0].name : `${files.length} files`
  if (body.review) {
    for (const f of files) await addReviewFile(p._id, f)
    await addActivity(p._id, `Shared ${what} for review`, 'version')
  } else {
    await addActivity(p._id, `${folder === 'Finals' ? 'Delivered' : 'Shared'} ${what}`, 'upload')
  }
  return json({ ok: true })
}
