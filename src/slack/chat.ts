import 'server-only'
import { postMessage, threadReplies, updateMessage, type ThreadMessage } from './api'
import { runAssistant, type ChatTurn } from './assistant'
import { slackEnv } from './env'

/**
 * One message from Josh, start to finish (run in after(), once Slack has its 200): a "Looking…" reply
 * in the thread, the thread so far as the conversation, Claude's answer in place of "Looking…", then
 * each proposal or draft as its own message with its buttons (so a tap changes only that message).
 */

export type IncomingMessage = { channel: string; ts: string; threadTs?: string; text: string; botUserId?: string }

const PLACEHOLDER = 'Looking…'
const MAX_HISTORY_CHARS = 30_000

/** Removes the bot's own @mention and Slack's link markup that adds nothing for Claude. */
export function cleanText(text: string, botUserId?: string) {
  let t = text
  if (botUserId) t = t.split(`<@${botUserId}>`).join('')
  return t.replace(/<mailto:([^|>]+)\|[^>]+>/g, '$1').replace(/\s+\n/g, '\n').trim()
}

function toTurns(msgs: ThreadMessage[], current: IncomingMessage): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const m of msgs) {
    if (m.ts === current.ts) continue
    const text = (m.text ?? '').trim()
    if (!text || text === PLACEHOLDER) continue
    const fromBot = Boolean(m.bot_id) || (current.botUserId && m.user === current.botUserId)
    if (!fromBot && m.user !== slackEnv.ownerId) continue // only Josh and the bot count
    if (m.subtype && m.subtype !== 'bot_message' && m.subtype !== 'thread_broadcast') continue
    const role = fromBot ? 'assistant' : 'user'
    const clean = fromBot ? text : cleanText(text, current.botUserId)
    const last = turns.at(-1)
    if (last?.role === role) last.text += `\n\n${clean}`
    else turns.push({ role, text: clean })
  }
  turns.push({ role: 'user', text: cleanText(current.text, current.botUserId) || '(empty message)' })
  // Merge a trailing duplicate role (Josh sent two in a row).
  const merged: ChatTurn[] = []
  for (const t of turns) {
    const last = merged.at(-1)
    if (last?.role === t.role) last.text += `\n\n${t.text}`
    else merged.push({ ...t })
  }
  // The conversation must start with Josh: a thread that began with a back-office ping gets it as context.
  if (merged[0]?.role === 'assistant') merged.unshift({ role: 'user', text: '(This thread started with a back-office ping, below.)' })
  // Keep the end of long threads.
  let total = 0
  let from = merged.length
  while (from > 0 && total + merged[from - 1].text.length <= MAX_HISTORY_CHARS) total += merged[--from].text.length
  let out = merged.slice(Math.max(0, Math.min(from, merged.length - 1)))
  if (out[0]?.role === 'assistant') out = [{ role: 'user', text: '(Earlier messages left out.)' }, ...out]
  return out
}

export async function handleMessage(m: IncomingMessage) {
  const thread = m.threadTs || m.ts
  const placeholder = await postMessage({ channel: m.channel, thread_ts: thread, text: PLACEHOLDER })
  const history = m.threadTs ? await threadReplies(m.channel, m.threadTs) : []
  let reply: Awaited<ReturnType<typeof runAssistant>>
  try {
    reply = await runAssistant(toTurns(history, m))
  } catch (e) {
    console.error('[slack] chat failed', e)
    reply = { text: 'Something went wrong on my side. Try again in a minute.', proposals: [] }
  }
  if (placeholder.ok && placeholder.ts) await updateMessage({ channel: m.channel, ts: placeholder.ts, text: reply.text })
  else await postMessage({ channel: m.channel, thread_ts: thread, text: reply.text })
  for (const p of reply.proposals) await postMessage({ channel: m.channel, thread_ts: thread, text: p.text, blocks: p.blocks })
}
