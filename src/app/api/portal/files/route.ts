import { driveReady } from '@/portal/config'
import { listProjectFiles } from '@/portal/drive'
import { json, projectAccess } from '@/portal/http'
import { sampleFiles } from '@/portal/samples'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The project's files, read live from its Drive folders. */
export async function GET(req: Request) {
  const a = await projectAccess(new URL(req.url).searchParams.get('project'))
  if (!a) return json({ ok: false }, 404)
  if (a.session.demo) return json({ ok: true, demo: true, files: sampleFiles() })
  if (!driveReady()) return json({ ok: true, connected: false, files: [] })
  try {
    return json({ ok: true, connected: true, files: await listProjectFiles(a.project) })
  } catch (e) {
    console.error('[portal] list files failed', e)
    return json({ ok: false, error: 'drive' }, 502)
  }
}
