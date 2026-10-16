import { timingSafeEqual } from 'node:crypto'
import { portalEnv, portalReady } from '@/portal/config'
import { json } from '@/portal/http'
import { runScheduler } from '@/portal/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Called every 10 minutes with "Authorization: Bearer CRON_SECRET". */
export async function GET(req: Request) {
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${portalEnv.cronSecret}`)
  if (!portalEnv.cronSecret || given.length !== want.length || !timingSafeEqual(given, want)) return json({ ok: false }, 401)
  if (!portalReady()) return json({ ok: true, skipped: 'portal not configured' })
  try {
    return json({ ok: true, ...(await runScheduler()) })
  } catch (e) {
    console.error('[portal] scheduler failed', e)
    return json({ ok: false, error: String(e).slice(0, 200) }, 500)
  }
}
