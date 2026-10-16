import { driveReady } from '@/portal/config'
import { downloadStream, fileInProject } from '@/portal/drive'
import { json, projectAccess } from '@/portal/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Streams a project file from Drive. Checks the file really belongs to this client's project first. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await projectAccess(new URL(req.url).searchParams.get('project'))
  if (!a) return json({ ok: false }, 404)
  if (a.session.demo) return json({ ok: false, error: 'This is a sample file. In a real project it downloads straight from Google Drive.' }, 404)
  if (!driveReady()) return json({ ok: false }, 503)
  try {
    const f = await fileInProject(a.project, id)
    if (!f) return json({ ok: false }, 404)
    const { res, name, type } = await downloadStream(f, req.headers.get('range'))
    const headers = new Headers({
      'Content-Type': type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      const v = res.headers.get(h)
      if (v) headers.set(h, v)
    }
    return new Response(res.body, { status: res.status, headers })
  } catch (e) {
    console.error('[portal] download failed', e)
    return json({ ok: false }, 502)
  }
}
