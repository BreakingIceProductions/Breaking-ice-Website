import { startSession } from '@/portal/auth'
import { portalEnv } from '@/portal/config'
import { json, sameOrigin } from '@/portal/http'
import { DEMO_EMAIL } from '@/portal/samples'

export const runtime = 'nodejs'

/** "See a sample project": signs in as a made-up client with sample data. */
export async function POST(req: Request) {
  if (!portalEnv.demo || !sameOrigin(req)) return json({ ok: false }, 404)
  await startSession(DEMO_EMAIL, true)
  return json({ ok: true, next: '/portal' })
}
