import 'server-only'
import { randomBytes } from 'node:crypto'
import { SITE_URL } from '@/lib/site'
import { createChannel, inviteToChannel, postMessage } from '@/slack/api'
import { slackEnv } from '@/slack/env'
import { assistantReply, type ClientData } from './chat-assistant'
import { getAccess, getPortalSettings, portalClient } from './data'
import { messageEmail, sendEmail } from './email'
import type { ChatMessage, PortalClient } from './types'

/**
 * The portal chat: one record per client (portal-chat-<client id>).
 *  - Josh tab: messages go to the client's private Slack channel; Josh's replies in the thread come back.
 *    If nobody answers in Portal settings' handoff time, the assistant answers for him, labelled.
 *  - Assistant tab: the AI answers straight away, within a monthly cap per client.
 */

export type ChatDoc = {
  _id: string
  _rev?: string
  messages?: ChatMessage[]
  threadTs?: string
  assistantCount?: { month: string; n: number }
  lastSeenAt?: string
  emailedAt?: string
  handoffFor?: string
}

const KEEP = 300
const THREAD_GAP = 12 * 3600_000
export const chatId = (clientId: string) => `portal-chat-${clientId}`
const newKey = () => randomBytes(6).toString('hex')
const month = () => new Date().toISOString().slice(0, 7)
const slackEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const quote = (s: string) => s.split('\n').map((l) => `> ${slackEsc(l)}`).join('\n')

export async function getChat(clientId: string): Promise<ChatDoc> {
  const doc = await portalClient.getDocument<ChatDoc>(chatId(clientId)).catch(() => null)
  return doc ?? { _id: chatId(clientId), messages: [] }
}

/** Appends messages (and any other fields), keeping the newest 300. */
async function append(clientId: string, msgs: ChatMessage[], set: Record<string, unknown> = {}) {
  const id = chatId(clientId)
  await portalClient.createIfNotExists({ _id: id, _type: 'portalChat', client: { _type: 'reference', _ref: clientId, _weak: true }, messages: [] })
  const p = portalClient.patch(id).setIfMissing({ messages: [] })
  if (msgs.length) p.append('messages', msgs.map((m) => ({ ...m, _type: 'chatMessage' })))
  if (Object.keys(set).length) p.set(set)
  await p.commit({ autoGenerateArrayKeys: false })
  const keys = await portalClient.fetch<string[]>(`*[_id == $id][0].messages[]._key`, { id }).catch(() => [] as string[])
  if (keys && keys.length > KEEP) await portalClient.patch(id).unset(keys.slice(0, keys.length - KEEP).map((k) => `messages[_key=="${k}"]`)).commit().catch(() => {})
}

/** Notes that the client looked (at most one write a minute), for the "Josh replied" email. */
export async function markSeen(clientId: string, doc: ChatDoc) {
  if (doc.lastSeenAt && Date.now() - Date.parse(doc.lastSeenAt) < 60_000) return
  await portalClient.createIfNotExists({ _id: chatId(clientId), _type: 'portalChat', client: { _type: 'reference', _ref: clientId, _weak: true }, messages: [] }).catch(() => {})
  await portalClient.patch(chatId(clientId)).set({ lastSeenAt: new Date().toISOString() }).commit().catch(() => {})
}

/** Everything the assistant may know: this client's portal, from the same loader the portal uses. */
export async function clientData(clientId: string): Promise<ClientData | null> {
  const a = await getAccess({ email: '', preview: clientId })
  const client = a.clients[0]
  if (!client) return null
  // A preview loads unsent quotes too; the assistant only knows the ones the client has seen.
  return { client, projects: a.projects, quotes: a.quotes.filter((q) => q.sharedAt), payments: a.payments }
}

/* ── Slack ─────────────────────────────────────────────────────────────── */

const channelName = (org: string, n: number) => {
  const base = `client-${org.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`.slice(0, 70).replace(/-+$/, '')
  return n > 1 ? `${base}-${n}` : base
}

/** The client's private channel, made (and Josh invited) the first time. */
async function ensureChannel(client: PortalClient): Promise<string | undefined> {
  if (client.chat?.slackChannelId) return client.chat.slackChannelId
  for (let n = 1; n <= 9; n++) {
    const r = await createChannel(channelName(client.organizationName, n), true)
    if (r.ok && r.id) {
      if (slackEnv.ownerId) await inviteToChannel(r.id, [slackEnv.ownerId])
      await portalClient.patch(client._id).setIfMissing({ chat: {} }).set({ 'chat.slackChannelId': r.id }).commit()
      return r.id
    }
    if (r.error !== 'name_taken') return undefined
  }
  return undefined
}

/** Posts a client's Josh-tab message: a new thread after 12 quiet hours, otherwise in the current one. */
async function toSlack(client: PortalClient, doc: ChatDoc, m: ChatMessage, page?: string) {
  const channel = await ensureChannel(client)
  if (!channel) return {}
  const lastAt = [...(doc.messages ?? [])].reverse().find((x) => x.tab === 'josh')?.at
  const fresh = !doc.threadTs || !lastAt || Date.now() - Date.parse(lastAt) > THREAD_GAP
  const text = fresh ? `*${slackEsc(m.who)}* (${slackEsc(client.organizationName)})${page ? ` · on ${slackEsc(page)}` : ''}\n${quote(m.text)}` : `*${slackEsc(m.who)}:*\n${quote(m.text)}`
  const r = await postMessage({ channel, text, ...(fresh ? {} : { thread_ts: doc.threadTs }) })
  if (!r.ok || !r.ts) return {}
  return { slackTs: r.ts, threadTs: fresh ? r.ts : doc.threadTs }
}

/* ── Sending ───────────────────────────────────────────────────────────── */

/** A client message in either tab. Returns what was added (the assistant's reply too, in that tab). */
export async function sendClientMessage(client: PortalClient, who: string, tab: 'josh' | 'assistant', text: string, page?: string): Promise<ChatMessage[]> {
  const doc = await getChat(client._id)
  const mine: ChatMessage = { _key: newKey(), at: new Date().toISOString(), from: 'client', who, text, tab }
  if (tab === 'josh') {
    const s = await toSlack(client, doc, mine, page).catch((e) => (console.error('[chat] slack post failed', e), {} as { slackTs?: string; threadTs?: string }))
    if (s.slackTs) mine.slackTs = s.slackTs
    await append(client._id, [mine], s.threadTs && s.threadTs !== doc.threadTs ? { threadTs: s.threadTs } : {})
    return [mine]
  }
  await append(client._id, [mine])
  const reply = await assistantTurn(client._id, [...(doc.messages ?? []), mine].filter((x) => x.tab === 'assistant'), 'assistant')
  return [mine, reply]
}

/** Counts against the monthly cap, then answers (or says it's resting). Saves the reply. */
async function assistantTurn(clientId: string, history: ChatMessage[], where: 'assistant' | 'handoff'): Promise<ChatMessage> {
  const [doc, settings] = await Promise.all([getChat(clientId), getPortalSettings()])
  const cap = settings.chatMonthlyCap ?? 200
  const n = doc.assistantCount?.month === month() ? doc.assistantCount.n : 0
  let text: string
  if (n >= cap) text = 'The assistant is resting for the month. Josh will answer here.'
  else {
    const data = await clientData(clientId).catch(() => null)
    text = data ? await assistantReply(data, history, where) : 'Sorry, I couldn’t answer just now. Josh will follow up here.'
  }
  const reply: ChatMessage = { _key: newKey(), at: new Date().toISOString(), from: 'assistant', who: 'Breaking Ice assistant (AI)', text, tab: where === 'handoff' ? 'josh' : 'assistant', ...(where === 'handoff' && { handoff: true }) }
  await append(clientId, [reply], n >= cap ? {} : { assistantCount: { month: month(), n: n + 1 } })
  return reply
}

/* ── Handoff: the assistant answers when Josh hasn't ──────────────────── */

/**
 * When the newest Josh-tab message is the client's, older than the handoff time, unanswered and not
 * handed off yet: the assistant answers in the Josh tab and leaves a note in the Slack thread.
 * Claimed first with the record's revision, so two polls (or a poll and the scheduler) can't both answer.
 */
export async function maybeHandoff(clientId: string, minutes?: number): Promise<boolean> {
  const doc = await getChat(clientId)
  if (!doc._rev) return false
  const josh = (doc.messages ?? []).filter((m) => m.tab === 'josh')
  const last = josh[josh.length - 1]
  if (!last || last.from !== 'client' || doc.handoffFor === last._key) return false
  const wait = (minutes ?? (await getPortalSettings()).chatHandoffMinutes ?? 10) * 60_000
  if (Date.now() - Date.parse(last.at) < wait) return false
  try {
    await portalClient.patch(doc._id).ifRevisionId(doc._rev).set({ handoffFor: last._key }).commit()
  } catch {
    return false // someone else claimed it (or the record changed): the next check decides again
  }
  const reply = await assistantTurn(clientId, josh, 'handoff')
  const client = await portalClient.fetch<PortalClient | null>(`*[_type == "client" && _id == $id][0]{_id, organizationName, chat}`, { id: clientId }).catch(() => null)
  const thread = last.slackTs ? (doc.threadTs ?? last.slackTs) : undefined
  if (client?.chat?.slackChannelId && thread) {
    await postMessage({ channel: client.chat.slackChannelId, thread_ts: doc.threadTs ?? thread, text: `_Assistant answered for you:_\n${quote(reply.text)}` }).catch(() => {})
  }
  return true
}

/** The scheduler's pass: every chat-enabled client. */
export async function handoffAll(log: string[]) {
  const ids = await portalClient.fetch<string[]>(`*[_type == "client" && chat.enabled == true]._id`).catch(() => [] as string[])
  if (!ids?.length) return
  const minutes = (await getPortalSettings()).chatHandoffMinutes ?? 10
  for (const id of ids) {
    if (await maybeHandoff(id, minutes).catch((e) => (log.push(`chat handoff failed: ${String(e).slice(0, 100)}`), false))) log.push(`chat: assistant answered for Josh (${id})`)
  }
}

/* ── Slack → portal ────────────────────────────────────────────────────── */

/**
 * Josh replied in a client's chat thread. Saved in the Josh tab (once per Slack message), and if the
 * client hasn't looked in 3 minutes, one email (at most every 30 minutes) says so.
 * Returns false when the message isn't a portal chat reply.
 */
export async function joshReplied(e: { channel: string; threadTs?: string; ts: string; text: string }): Promise<boolean> {
  if (!e.threadTs) return false // top-level channel messages are Josh's own notes
  const client = await portalClient.fetch<PortalClient | null>(`*[_type == "client" && chat.slackChannelId == $c][0]{_id, organizationName, contacts[]{_key, name, email, role, getsEmails}, chat}`, { c: e.channel }).catch(() => null)
  if (!client) return false
  const doc = await getChat(client._id)
  const msgs = doc.messages ?? []
  const known = doc.threadTs === e.threadTs || msgs.some((m) => m.slackTs === e.threadTs)
  if (!known) return false
  if (msgs.some((m) => m.slackTs === e.ts)) return true
  const text = e.text.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2 ($1)').replace(/<(https?:\/\/[^>]+)>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').slice(0, 4000)
  const settings = await getPortalSettings()
  const reply: ChatMessage = { _key: newKey(), at: new Date().toISOString(), from: 'josh', who: settings.producer?.name || 'Josh', text, tab: 'josh', slackTs: e.ts }
  const away = !doc.lastSeenAt || Date.now() - Date.parse(doc.lastSeenAt) > 3 * 60_000
  const emailOk = !doc.emailedAt || Date.now() - Date.parse(doc.emailedAt) > 30 * 60_000
  const send = away && emailOk
  await append(client._id, [reply], send ? { emailedAt: new Date().toISOString() } : {})
  if (send) {
    const to = (client.contacts ?? []).filter((c) => c.email && c.getsEmails !== false).map((c) => c.email)
    if (to.length) {
      const mail = messageEmail({
        subject: 'Josh replied to your message',
        body: `Josh replied to your message in your client portal:\n\n“${text.slice(0, 600)}${text.length > 600 ? '…' : ''}”\n\n[button: Open the chat](${SITE_URL}/portal?chat=open)`,
      })
      await sendEmail({ to, bcc: settings.copyTo ? [settings.copyTo] : undefined, ...mail }).catch((err) => console.error('[chat] reply email failed', err))
    }
  }
  return true
}
