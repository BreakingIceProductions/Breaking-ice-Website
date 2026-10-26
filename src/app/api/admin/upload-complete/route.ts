import { adminFromRequest } from '@/admin/auth'
import { addVersion, getProject } from '@/admin/data'
import { addActivity } from '@/portal/data'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/**
 * After back-office uploads. Documents become a new version of the given title
 * (one file per version); Reference Assets are just noted on the project.
 */
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

  if (body.folder === 'Documents') {
    const send = body.send !== false
    for (const f of files) {
      const title = String(body.title ?? '').trim().slice(0, 140) || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
      const entry = await addVersion(p._id, {
        category: 'document',
        title,
        fileUrl: `https://drive.google.com/file/d/${f.id}/view`,
        fileName: f.name,
        notes: String(body.notes ?? '').trim().slice(0, 2000) || undefined,
        send,
      })
      if (entry) await addActivity(p._id, `${entry.title}: Version ${entry.version} ${send ? 'sent for review' : 'added'}`, 'version')
    }
  } else {
    await addActivity(p._id, `Shared ${files.length === 1 ? files[0].name : `${files.length} files`} in Reference Assets`, 'upload')
  }
  return json({ ok: true })
}
