import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { driveReady, MAX_UPLOAD_BYTES } from '@/portal/config'
import { startUpload } from '@/portal/drive'
import { json } from '@/portal/http'
import type { ClientProject } from '@/portal/types'

export const runtime = 'nodejs'

/** Opens an upload from the back office straight into the project's Documents or Reference Assets folder. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const folder = body.folder === 'Documents' ? 'Documents' : 'Reference Assets'
  const name = String(body.name ?? '').slice(0, 200)
  const size = Number(body.size)
  if (!name || !Number.isFinite(size) || size <= 0) return json({ ok: false, error: 'invalid' }, 400)
  if (size > MAX_UPLOAD_BYTES) return json({ ok: false, error: 'too-big' }, 400)
  if (admin.sample) return json({ ok: true, demo: true })
  if (!driveReady()) return json({ ok: false, error: 'not-configured' }, 503)
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false }, 404)
  const origin = req.headers.get('origin') || new URL(req.url).origin
  try {
    const sessionUrl = await startUpload(p as unknown as ClientProject, { name, size, type: String(body.type || '') }, origin, 'Breaking Ice', folder)
    return json({ ok: true, sessionUrl })
  } catch (e) {
    console.error('[admin] upload start failed', e)
    return json({ ok: false, error: 'drive' }, 502)
  }
}
