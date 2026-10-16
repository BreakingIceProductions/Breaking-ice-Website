import { after } from 'next/server'
import { portalReady } from '@/portal/config'
import { handleFrameio, verifyFrameio } from '@/portal/frameio'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** Frame.io webhook. Answers within Frame.io's 5-second limit and does the work afterwards. */
export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifyFrameio(raw, req.headers.get('x-frameio-request-timestamp'), req.headers.get('x-frameio-signature'))) {
    return json({ ok: false }, 401)
  }
  if (!portalReady()) return json({ ok: true, skipped: 'portal not configured' })
  let event
  try {
    event = JSON.parse(raw)
  } catch {
    return json({ ok: false }, 400)
  }
  after(async () => {
    try {
      await handleFrameio(event)
    } catch (e) {
      console.error('[portal] frameio event failed', event?.type, e)
    }
  })
  return json({ ok: true })
}
