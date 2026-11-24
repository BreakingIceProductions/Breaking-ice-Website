import { after } from 'next/server'
import { joshReplied } from '@/portal/chat'
import { handleMessage } from '@/slack/chat'
import { slackChatReady, slackEnv } from '@/slack/env'
import { readSlackRequest } from '@/slack/verify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The answer is worked out in after(), which gets the route's time: Claude may look several things up.
export const maxDuration = 300

/**
 * Slack Events API. Every request's signature is checked. Answers only Josh (SLACK_OWNER_ID):
 *  - message in a DM with the bot, or in the pings channel (SLACK_CHANNEL_ID)
 *  - app_mention anywhere the bot is
 *  - message in a thread of a client's portal-chat channel: Josh's reply, saved to their portal chat
 * Bot messages (its own included), edits, joins and other subtypes are ignored. Slack gets its 200 at
 * once; the reply is worked out afterwards and posted in the message's thread.
 */

type SlackEvent = { type?: string; subtype?: string; user?: string; bot_id?: string; text?: string; channel?: string; channel_type?: string; ts?: string; thread_ts?: string }
type Envelope = { type?: string; challenge?: string; event_id?: string; event?: SlackEvent; authorizations?: { user_id?: string }[] }

const ok = () => new Response(null, { status: 200 })
/** Event ids seen lately on this instance (Slack's retries are also refused by header). */
const seen = new Map<string, number>()
const firstTime = (id: string) => {
  const now = Date.now()
  for (const [k, at] of seen) if (now - at > 15 * 60_000) seen.delete(k)
  if (seen.has(id)) return false
  seen.set(id, now)
  return true
}

export async function POST(req: Request) {
  if (!slackChatReady()) return new Response('Slack is not set up.', { status: 503 })
  const r = await readSlackRequest(req, slackEnv.signingSecret)
  if (!r.ok) return new Response('Bad signature.', { status: 401 })
  let body: Envelope
  try {
    body = JSON.parse(r.body)
  } catch {
    return new Response('Bad request.', { status: 400 })
  }

  if (body.type === 'url_verification') return Response.json({ challenge: String(body.challenge ?? '') })
  // A retry means our first 200 was slow; the first delivery is already being handled.
  if (req.headers.get('x-slack-retry-num')) return ok()
  if (body.type !== 'event_callback' || !body.event) return ok()
  if (body.event_id && !firstTime(body.event_id)) return ok()

  const e = body.event
  const botUserId = body.authorizations?.[0]?.user_id
  // Private-channel messages (client chats): log why one is kept or dropped, without its text.
  if (e.type === 'message' && e.channel_type === 'group') {
    console.log('[slack] group message', JSON.stringify({ channel: e.channel, subtype: e.subtype ?? null, bot: Boolean(e.bot_id), owner: e.user === slackEnv.ownerId, thread: Boolean(e.thread_ts && e.thread_ts !== e.ts) }))
  }
  if (e.bot_id || e.subtype || !e.user || e.user !== slackEnv.ownerId || !e.channel || !e.ts || !e.text?.trim()) return ok()
  if (botUserId && e.user === botUserId) return ok()

  // Josh's messages in a client's portal-chat channel (top-level or in a thread) go to their portal.
  // joshReplied checks the channel belongs to a client and skips ones starting with "note:".
  if (e.type === 'message' && e.channel_type === 'group' && e.channel !== slackEnv.channelId) {
    const reply = { channel: e.channel, threadTs: e.thread_ts && e.thread_ts !== e.ts ? e.thread_ts : undefined, ts: e.ts, text: e.text }
    after(() => joshReplied(reply).then(() => undefined).catch((err) => console.error('[slack] portal chat reply failed', err)))
    return ok()
  }

  const isDm = e.type === 'message' && e.channel_type === 'im'
  const inPings = e.type === 'message' && e.channel === slackEnv.channelId
  const mention = e.type === 'app_mention'
  // In the pings channel an @mention arrives twice (message and app_mention): answer the app_mention only.
  const mentioned = Boolean(botUserId && e.text.includes(`<@${botUserId}>`))
  if (!(isDm || mention || (inPings && !mentioned))) return ok()

  const msg = { channel: e.channel, ts: e.ts, threadTs: e.thread_ts, text: e.text.slice(0, 8000), botUserId }
  after(() => handleMessage(msg).catch((err) => console.error('[slack] message handling failed', err)))
  return ok()
}
