import { after } from 'next/server'
import { getSession } from '@/portal/auth'
import { getChat, markSeen, maybeHandoff, maybeSummarize, sendClientMessage } from '@/portal/chat'
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
 * In a back-office preview the chat works, as Josh: messages are marked staff, never as the client.
 * The sample portal answers with two made-up messages and sends nothing.
 */

const SAMPLE: ChatMessage[] = [
  { _key: 's1', at: new Date(Date.now() - 50 * 60_000).toISOString(), from: 'client', who: 'Alex Sample', text: 'Hi Josh, could we move the interview day to the following week?', tab: 'josh' },
  { _key: 's2', at: new Date(Date.now() - 42 * 60_000).toISOString(), from: 'josh', who: 'Josh', text: 'Hi Alex, the following Tuesday works on my side. I’ll update the dates in your portal.', tab: 'josh' },
]

/** The chat-enabled client, and who's writing: the signed-in contact by full name, or Josh in a preview. */
async function who(session: Session) {
  const a = await getAccess(session)
  const client = a.clients.find((c) => c.chat?.enabled)
  if (!client) return null
  const staff = Boolean(session.preview)
  const contact = a.clients.flatMap((c) => c.contacts ?? []).find((c) => c.email?.toLowerCase() === session.email.toLowerCase())
  const name = staff ? 'Josh Ferguson' : contact?.name || a.name || session.email.split('@')[0]
  return { client, staff, by: { name, email: session.email.toLowerCase(), staff } }
}

/** What the browser gets: no email addresses, and `mine` for the person looking. */
const forBrowser = (msgs: ChatMessage[], me: { email: string; staff: boolean }) =>
  msgs.map(({ email, ...m }) => ({ ...m, mine: m.from === 'client' && (me.staff ? Boolean(m.staff) : !m.staff && email === me.email) }))

export async function GET() {
  const session = await getSession()
  if (!session) return json({ ok: false }, 401)
  if (session.demo) return json({ ok: true, enabled: true, sample: true, me: 'Alex Sample', staff: false, messages: SAMPLE.map((m) => ({ ...m, mine: m.from === 'client' })) })
  const w = await who(session)
  if (!w) return json({ ok: true, enabled: false, messages: [] })
  await maybeHandoff(w.client._id).catch((e) => console.error('[chat] handoff failed', e))
  const doc = await getChat(w.client._id)
  // Josh looking from a preview isn't the client looking (that decides the "Josh replied" email).
  if (!w.staff) await markSeen(w.client._id, doc)
  // Recaps for Josh, after the reply has gone (they may call Claude).
  const clientId = w.client._id
  after(() => maybeSummarize(clientId).then(() => undefined).catch((e) => console.error('[chat] summary failed', e)))
  return json({ ok: true, enabled: true, staff: w.staff, me: w.by.name, messages: forBrowser(doc.messages ?? [], { email: w.by.email, staff: w.staff }) })
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const session = await getSession()
  if (!session) return json({ ok: false }, 401)
  const body = await req.json().catch(() => ({}))
  const tab = body.tab === 'assistant' ? 'assistant' : body.tab === 'josh' ? 'josh' : null
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : ''
  if (!tab || !text) return json({ ok: false, error: 'invalid' }, 400)
  if (limited(`chat:${session.email}`, 20, 60_000)) return json({ ok: false, error: 'slow-down' }, 429)
  if (session.demo) {
    const at = new Date().toISOString()
    const mine: ChatMessage = { _key: `d${Date.now()}`, at, from: 'client', who: 'Alex Sample', text, tab, mine: true }
    const reply: ChatMessage[] = tab === 'assistant' ? [{ _key: `d${Date.now()}a`, at, from: 'assistant', who: 'Breaking Ice assistant (AI)', text: 'This is the sample portal, so I can’t answer for real. In your own portal I can help with your projects, versions and dates.', tab }] : []
    return json({ ok: true, sample: true, added: [mine, ...reply] })
  }
  const w = await who(session)
  if (!w) return json({ ok: false, error: 'off' }, 403)
  const page = typeof body.page === 'string' && body.page.startsWith('/portal') ? body.page.slice(0, 200) : undefined
  try {
    const added = await sendClientMessage(w.client, w.by, tab, text, page)
    return json({ ok: true, added: forBrowser(added, { email: w.by.email, staff: w.staff }) })
  } catch (e) {
    console.error('[chat] send failed', e)
    return json({ ok: false, error: 'failed' }, 500)
  }
}
