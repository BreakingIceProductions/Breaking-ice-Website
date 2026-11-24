import 'server-only'
import type { SlackBlock } from './blocks'
import { slackEnv } from './env'

/**
 * A tiny Slack Web API client: plain fetch with the bot token. Write methods take JSON; read methods
 * (conversations.replies) take form fields, as Slack requires. Never logs the token.
 */

type SlackResult = { ok: boolean; error?: string; [k: string]: unknown }

async function call(method: string, init: RequestInit): Promise<SlackResult> {
  if (!slackEnv.botToken) return { ok: false, error: 'not-configured' }
  try {
    const res = await fetch(`https://slack.com/api/${method}`, { ...init, headers: { Authorization: `Bearer ${slackEnv.botToken}`, ...init.headers }, cache: 'no-store' })
    const data = (await res.json().catch(() => ({ ok: false, error: `http-${res.status}` }))) as SlackResult
    if (!data.ok) console.error(`[slack] ${method} failed:`, data.error)
    return data
  } catch (e) {
    console.error(`[slack] ${method} failed`, String(e).slice(0, 200))
    return { ok: false, error: 'network' }
  }
}

const postJson = (method: string, body: Record<string, unknown>) =>
  call(method, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })

export type PostedMessage = { ok: boolean; ts?: string; channel?: string; error?: string }

export async function postMessage(m: { channel: string; text: string; blocks?: SlackBlock[]; thread_ts?: string }): Promise<PostedMessage> {
  const r = await postJson('chat.postMessage', { channel: m.channel, text: m.text.slice(0, 39_000), unfurl_links: false, unfurl_media: false, ...(m.blocks && { blocks: m.blocks }), ...(m.thread_ts && { thread_ts: m.thread_ts }) })
  return { ok: r.ok, ts: r.ts as string | undefined, channel: r.channel as string | undefined, error: r.error }
}

/** Replaces a message the bot posted. `blocks: []` clears the old blocks. */
export async function updateMessage(m: { channel: string; ts: string; text: string; blocks?: SlackBlock[] }) {
  return postJson('chat.update', { channel: m.channel, ts: m.ts, text: m.text.slice(0, 39_000), ...(m.blocks && { blocks: m.blocks }) })
}

export async function postEphemeral(m: { channel: string; user: string; text: string; thread_ts?: string }) {
  return postJson('chat.postEphemeral', { channel: m.channel, user: m.user, text: m.text, ...(m.thread_ts && { thread_ts: m.thread_ts }) })
}

export type ThreadMessage = { user?: string; bot_id?: string; text?: string; ts: string; subtype?: string }

/** A thread's messages, oldest first (the parent included). Empty when it can't be read. */
export async function threadReplies(channel: string, ts: string, limit = 40): Promise<ThreadMessage[]> {
  const r = await call('conversations.replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ channel, ts, limit: String(limit), inclusive: 'true' }).toString(),
  })
  return r.ok && Array.isArray(r.messages) ? (r.messages as ThreadMessage[]) : []
}

/** Posts to an interaction's response_url (only Slack's own hooks address is accepted). */
export async function respond(responseUrl: string, body: { text: string; replace_original?: boolean; response_type?: 'ephemeral' | 'in_channel'; blocks?: SlackBlock[] }) {
  if (!/^https:\/\/hooks\.slack\.com\//.test(responseUrl)) return
  await fetch(responseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch((e) => console.error('[slack] response_url failed', String(e).slice(0, 200)))
}

/** Makes a channel (private by default). Returns its id, or the Slack error (e.g. 'name_taken'). */
export async function createChannel(name: string, isPrivate = true): Promise<{ ok: boolean; id?: string; error?: string }> {
  const r = await postJson('conversations.create', { name, is_private: isPrivate })
  return { ok: r.ok, id: (r.channel as { id?: string } | undefined)?.id, error: r.error }
}

/** Adds people to a channel the bot is in. 'already_in_channel' counts as done. */
export async function inviteToChannel(channel: string, users: string[]) {
  const r = await postJson('conversations.invite', { channel, users: users.join(',') })
  return { ok: r.ok || r.error === 'already_in_channel', error: r.error }
}

/** The workspace's team id (T…), for app.slack.com links. */
export async function teamId(): Promise<string | undefined> {
  const r = await call('auth.test', { method: 'POST' })
  return r.ok ? (r.team_id as string | undefined) : undefined
}
