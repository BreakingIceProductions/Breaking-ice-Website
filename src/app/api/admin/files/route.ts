import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { driveReady } from '@/portal/config'
import { listProjectFiles, trashProjectFile } from '@/portal/drive'
import { json } from '@/portal/http'
import { sampleFiles } from '@/portal/samples'
import type { ClientProject } from '@/portal/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Everything in a project's Drive folders, as the client sees it. */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  if (admin.sample) return json({ ok: true, connected: true, files: sampleFiles() })
  const p = await getProject(new URL(req.url).searchParams.get('projectId') ?? '')
  if (!p) return json({ ok: false }, 404)
  if (!driveReady()) return json({ ok: true, connected: false, files: [] })
  try {
    return json({ ok: true, connected: true, files: await listProjectFiles(p as unknown as ClientProject) })
  } catch (e) {
    console.error('[admin] list files failed', e)
    return json({ ok: false, error: 'drive' }, 502)
  }
}

/** { projectId, fileId }: moves one of the project's files to Drive's trash. */
export async function DELETE(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  if (admin.sample) return json({ ok: true })
  const p = await getProject(String(body.projectId ?? ''))
  if (!p || !driveReady()) return json({ ok: false }, 404)
  try {
    return (await trashProjectFile(p as unknown as ClientProject, String(body.fileId ?? ''))) ? json({ ok: true }) : json({ ok: false }, 404)
  } catch (e) {
    console.error('[admin] delete file failed', e)
    return json({ ok: false, error: 'drive' }, 502)
  }
}
