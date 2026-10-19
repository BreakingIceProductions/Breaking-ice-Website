import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { planStage, runStage } from '@/admin/stages'
import { json } from '@/portal/http'
import { PIPELINE_STAGES, type PipelineStage } from '@/sanity/portal/office-constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** { projectId, to, run?: boolean, skip?: string[] } → the preview, or the results of running it. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const to = String(body.to ?? '') as PipelineStage
  if (!PIPELINE_STAGES.some((s) => s.value === to)) return json({ ok: false, error: 'bad-stage' }, 400)
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)
  if (!body.run) return json({ ok: true, plan: await planStage(p, to) })
  if (admin.sample) return json({ ok: true, sample: true, results: [{ id: 'stage', ok: true, message: 'Sample mode: nothing was changed.' }] })
  const skip = Array.isArray(body.skip) ? body.skip.map(String).slice(0, 50) : []
  try {
    return json({ ok: true, results: await runStage(p, to, skip) })
  } catch (e) {
    console.error('[admin] stage change failed', e)
    return json({ ok: false, error: 'failed', message: String(e).slice(0, 200) }, 500)
  }
}
