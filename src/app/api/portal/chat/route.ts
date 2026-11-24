import { getSession } from '@/portal/auth'
import { getChat, markSeen, maybeHandoff, sendClientMessage } from '@/portal/chat'
import { getAccess } from '@/portal/data'
import { json, limited, sameOrigin } from '@/portal/http'
import type { ChatMessage, Session } from '@/portal/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The assistant may look at the calendar before answering.
export const maxDuration = 60

/**
 * The portal chat for the signed-in client (the first of their clients with chat switched on).
 *   GET  → the messages (and, when Josh hasn't replied in time, the assistant answers for him first)
 *   POST { tab, text, page? } → a message; in the Assistant tab the reply comes back with it
 * The sample portal answers with two made-up messages and sends nothing.
 */

const SAMPLE: ChatMessage[] = [
  { _key: 's1', at: new Date(Date.now() - 50 * 60_000).toISOString(), from: 'client', who: 'Alex', text: 'Hi Josh, could we move the interview day to the following week?', tab: 'josh' },
  { _key: 's2', at: new Date(Date.now() - 42 * 60_000).toISOString(), from: 'josh', who: 'Josh', text: 'Hi Alex, the following Tuesday works on my side. I’ll update the dates in your portal.', tab: 'josh' },
]

async function who(session: Session) {
  const a = await getAccess(session)
  const client = a.clients.find((c) => c.chat?.enabled)
  return client ? { client, name: a.name ?? session.email.split('@')[0] } : null
}

export async function GET() {
  const session = await getSession()
  if (!session) return json({ ok: false }, 401)
  if (session.demo) return json({ ok: true, enabled: true, sample: true, messages: SAMPLE })
  const w = await who(session)
  if (!w) return json({ ok: true, enabled: false, messages: [] })
  if (!session.preview) await maybeHandoff(w.client._id).catch((e) => console.error('[chat] handoff failed', e))
  const doc = await getChat(w.client._id)
  if (!session.preview) await markSeen(w.client._id, doc)
  return json({ ok: true, enabled: true, preview: Boolean(session.preview), messages: doc.messages ?? [] })
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const session = await getSession()
  if (!session) return json({ ok: false }, 401)
  const body = await req.json().catch(() => ({}))
  const tab = body.tab === 'assistant' ? 'assistant' : body.tab === 'josh' ? 'josh' : null
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : ''
  if (!tab || !text) return json({ ok: false, error: 'invalid' }, 400)
  if (session.preview) return json({ ok: false, error: 'preview' }, 403)
  if (limited(`chat:${session.email}`, 20, 60_000)) return json({ ok: false, error: 'slow-down' }, 429)
  if (session.demo) {
    const at = new Date().toISOString()
    const mine: ChatMessage = { _key: `d${Date.now()}`, at, from: 'client', who: 'Alex', text, tab }
    const reply: ChatMessage[] = tab === 'assistant' ? [{ _key: `d${Date.now()}a`, at, from: 'assistant', who: 'Breaking Ice assistant (AI)', text: 'This is the sample portal, so I can’t answer for real. In your own portal I can help with your projects, versions and dates.', tab }] : []
    return json({ ok: true, sample: true, added: [mine, ...reply] })
  }
  const w = await who(session)
  if (!w) return json({ ok: false, error: 'off' }, 403)
  const page = typeof body.page === 'string' && body.page.startsWith('/portal') ? body.page.slice(0, 200) : undefined
  try {
    const added = await sendClientMessage(w.client, w.name, tab, text, page)
    return json({ ok: true, added })
  } catch (e) {
    console.error('[chat] send failed', e)
    return json({ ok: false, error: 'failed' }, 500)
  }
}
