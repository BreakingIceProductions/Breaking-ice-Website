import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { googleThumbnail } from '@/portal/drive-file'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** Preview image of a document version, for the back office. */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false }, 401)
  const q = new URL(req.url).searchParams
  const p = await getProject(q.get('projectId') ?? '')
  const d = p?.deliverables.find((x) => x._key === q.get('key'))
  if (!d?.fileUrl) return json({ ok: false }, 404)
  return (await googleThumbnail(d.fileUrl)) ?? json({ ok: false }, 404)
}
