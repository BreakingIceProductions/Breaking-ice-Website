import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { json } from '@/portal/http'
import { pushToVimeo } from '@/portal/vimeo'

export const runtime = 'nodejs'

/** Tries the Vimeo copy of one finished file again (after a new token, say). Sample mode answers without touching Vimeo. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  if (admin.sample) return json({ ok: true, sample: true, vimeo: 'uploading' })
  const p = await getProject(String(body.projectId ?? ''))
  const d = p?.deliverables.find((x) => x._key === body.key)
  if (!p || !d) return json({ ok: false }, 404)
  if (d.host !== 'r2' || !d.r2Key) return json({ ok: false, error: 'not-r2' }, 400)
  const copy = await pushToVimeo(p._id, d, `${p.client.organizationName} · ${d.title}`)
  return json({ ok: true, vimeo: copy.vimeoState === 'failed' ? 'failed' : 'uploading', vimeoError: copy.vimeoError })
}
