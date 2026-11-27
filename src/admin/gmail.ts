import 'server-only'
import { randomBytes } from 'node:crypto'
import { presign, r2Env, r2Ready } from '@/portal/r2'
import { latestSentEmails, listSentEmails } from '@/portal/sent-emails'
import { adminSampleMode, googleOAuthReady } from './config'
import { listClients, type ClientSummary } from './data'
import { googleAccess, googleConnection, GoogleAuthError, hasGmailScope } from './gcal'
import { isSalesStage, pageHref } from './lead'
import { buildMime, gmailQueries, headerOf, isMailAddress, matchClients, messageBody, parseAddressList, readParts, type GPart, type OutFile } from './mail-core'
import { MAIL_LIMITS, siteEmailLine, type Conversation, type ConversationRow, type MailMessage, type MailPerson, type MailProject, type MailState, type SiteEmail } from './mail-shared'
import { stageIndex } from './stages'

/**
 * Client correspondence from Josh's own Gmail (josh@breakingiceproductions.com), on the same Google sign-in as
 * the calendar (gcal.ts). One conversation per client company: every Gmail message whose From, To or Cc has one
 * of the client's people (contacts, and the person on any of its leads) is in it, across every Gmail thread, in
 * date order. Mail from anyone else is left alone. Nothing is copied out of Gmail: each page asks Gmail with a
 * search per client, and a short in-memory cache keeps that cheap. Replies are sent through Gmail itself, so they
 * show in Sent (and Spark) and thread with the latest Gmail thread.
 */

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const UPLOAD = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart'
const OWN = 'josh@breakingiceproductions.com'

export class MailScopeError extends Error {}
export class MailInputError extends Error {}

export async function mailState(): Promise<MailState> {
  if (adminSampleMode()) return 'sample'
  if (!googleOAuthReady()) return 'not-set-up'
  const c = await googleConnection().catch(() => null)
  if (!c) return 'not-connected'
  return hasGmailScope(c) ? 'ready' : 'needs-scope'
}

/* ── Gmail calls ──────────────────────────────────────────────────── */

async function gmail<T>(path: string, init: RequestInit = {}, base = API): Promise<T> {
  const { token } = await googleAccess()
  const res = await fetch(path.startsWith('http') ? path : `${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body && typeof init.body === 'string' && !init.headers ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    cache: 'no-store',
  })
  if (res.status === 401) throw new GoogleAuthError('Google signed this site out. Connect Google again in Settings.')
  if (res.status === 403) {
    const t = await res.text()
    if (/insufficient|scope|PERMISSION_DENIED/i.test(t)) throw new MailScopeError('Reconnect Google to include email')
    throw new Error(`gmail 403: ${t.slice(0, 200)}`)
  }
  if (!res.ok) throw new Error(`gmail ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (res.status === 204 ? null : await res.json()) as T
}

/** A few calls at a time, so a long client list doesn't trip Gmail's per-second limit. */
async function pool<T, R>(items: T[], size: number, run: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const n = i++
        out[n] = await run(items[n])
      }
    }),
  )
  return out
}

type Ref = { id: string; threadId: string }

/** Message ids for some searches, newest first, up to `max` in all. */
async function search(queries: string[], max: number): Promise<Ref[]> {
  const seen = new Map<string, Ref>()
  for (const q of queries) {
    let page = ''
    for (let n = 0; n < 5 && seen.size < max * queries.length; n++) {
      const qs = new URLSearchParams({ q, maxResults: String(Math.min(100, max)), ...(page ? { pageToken: page } : {}) })
      const r = await gmail<{ messages?: Ref[]; nextPageToken?: string }>(`/messages?${qs}`)
      for (const m of r.messages ?? []) seen.set(m.id, m)
      if (!r.nextPageToken || (r.messages?.length ?? 0) >= max) break
      page = r.nextPageToken
    }
  }
  // Gmail ids grow with time, so this keeps newest first across separate searches.
  return [...seen.values()].sort((a, b) => (BigInt(`0x${b.id}`) > BigInt(`0x${a.id}`) ? 1 : -1)).slice(0, max)
}

/* ── Cache ────────────────────────────────────────────────────────── */

const cache = new Map<string, { at: number; value: unknown }>()
const TTL = 90_000
async function cached<T>(key: string, fresh: boolean, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 300) cache.delete(cache.keys().next().value as string)
  return value
}
/** Parsed messages never change, apart from unread (which is read from Gmail each time). */
const parsed = new Map<string, Omit<MailMessage, 'unread'> & { labels: string[] }>()
const forget = () => {
  for (const k of cache.keys()) if (!k.startsWith('dir')) cache.delete(k)
}

/* ── Who belongs to which client ───────────────────────────────────── */

type DirClient = { id: string; name: string; people: MailPerson[]; projects: MailProject[] }

function directoryOf(clients: ClientSummary[], own: string): DirClient[] {
  return clients.map((c) => {
    const people = new Map<string, MailPerson>()
    for (const x of c.contacts ?? []) {
      const email = x.email?.trim().toLowerCase()
      if (email && isMailAddress(email) && email !== own) people.set(email, { name: x.name?.trim() || email, email, ...(x.role && { role: x.role }) })
    }
    for (const p of c.projects) {
      const l = p.office.lead
      const email = l?.email?.trim().toLowerCase()
      if (email && isMailAddress(email) && email !== own && !people.has(email)) people.set(email, { name: l?.name?.trim() || email, email, lead: true })
    }
    const projects = c.projects
      .filter((p) => !p.archived && stageIndex(p.pipelineStage) < stageIndex('paid'))
      .map((p) => ({ id: p._id, title: p.title + (isSalesStage(p.pipelineStage) ? ' (lead)' : ''), href: pageHref(p._id, p.pipelineStage) }))
    return { id: c._id, name: c.organizationName, people: [...people.values()], projects }
  })
}

async function ownAddress() {
  if (adminSampleMode()) return OWN
  const c = await googleConnection().catch(() => null)
  return (c?.email ?? OWN).toLowerCase()
}

export async function mailDirectory(fresh = false): Promise<DirClient[]> {
  const own = await ownAddress()
  return cached('dir', fresh, async () => {
    const dir = directoryOf(await listClients(), own)
    if (adminSampleMode()) {
      const { sampleExtraPeople } = await import('./mail-samples')
      for (const c of dir) for (const p of sampleExtraPeople(c.id)) if (!c.people.some((x) => x.email === p.email)) c.people.push(p)
    }
    return dir
  })
}

/* ── Reading ──────────────────────────────────────────────────────── */

type GMessage = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GPart }

const decodeSnippet = (s: string) =>
  s.replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const attachmentUrl = (messageId: string, attId: string, name: string, type: string, inline = false) =>
  `/api/admin/emails/attachment?${new URLSearchParams({ m: messageId, a: attId, n: name, t: type, ...(inline ? { i: '1' } : {}) })}`

function parse(m: GMessage, own: string) {
  const hit = parsed.get(m.id)
  if (hit) return hit
  const p = m.payload ?? {}
  const from = parseAddressList(headerOf(p, 'From'))[0] ?? { name: '', email: '' }
  const parts = readParts(p)
  const body = messageBody(parts.html, parts.text, {
    cid: (cid) => {
      const f = parts.inline.get(cid)
      return f ? attachmentUrl(m.id, f.id, f.name, f.type, true) : undefined
    },
  })
  const date = Number(m.internalDate)
  const msg = {
    id: m.id,
    threadId: m.threadId,
    at: new Date(Number.isFinite(date) ? date : Date.parse(headerOf(p, 'Date') ?? '') || Date.now()).toISOString(),
    from: { name: from.name || from.email, email: from.email },
    to: parseAddressList(headerOf(p, 'To')),
    cc: parseAddressList(headerOf(p, 'Cc')),
    subject: headerOf(p, 'Subject')?.trim() || '(no subject)',
    mine: from.email === own || Boolean(m.labelIds?.includes('SENT')),
    body,
    files: parts.files,
    messageId: headerOf(p, 'Message-ID') ?? headerOf(p, 'Message-Id'),
    references: headerOf(p, 'References'),
    labels: m.labelIds ?? [],
  }
  if (!body.main && m.snippet) msg.body = { kind: 'text', main: decodeSnippet(m.snippet) }
  parsed.set(m.id, msg)
  if (parsed.size > 1500) parsed.delete(parsed.keys().next().value as string)
  return msg
}

/** The list: each client's newest message (a site email counts), unread count, and who it's waiting on. Clients with no mail have no `last`. */
export async function listConversations(fresh = false): Promise<ConversationRow[]> {
  const [rows, site] = await Promise.all([gmailRows(fresh), latestSentEmails().catch((e) => (console.error('[emails] site emails failed', e), new Map<string, SiteEmail>()))])
  return rows
    .map((r) => {
      const s = site.get(r.clientId)
      return s && (!r.last || s.at > r.last.at) ? { ...r, last: { at: s.at, snippet: siteEmailLine(s), fromName: 'You', mine: true } } : r
    })
    .sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? ''))
}

async function gmailRows(fresh: boolean): Promise<ConversationRow[]> {
  if (adminSampleMode()) return (await import('./mail-samples')).sampleRows(await mailDirectory())
  const dir = (await mailDirectory(fresh)).filter((c) => c.people.length)
  const own = await ownAddress()
  return cached('rows', fresh, async () => {
    const rows = await pool(dir, 4, async (c): Promise<ConversationRow> => {
      const emails = c.people.map((p) => p.email)
      const [latest, unread] = await Promise.all([search(gmailQueries(emails), 1), search(gmailQueries(emails, 'is:unread'), 50)])
      const row: ConversationRow = { clientId: c.id, clientName: c.name, people: c.people, unread: unread.length }
      if (latest[0]) {
        const m = await gmail<GMessage>(`/messages/${latest[0].id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)
        const from = parseAddressList(headerOf(m.payload, 'From'))[0]
        const mine = from?.email === own || Boolean(m.labelIds?.includes('SENT'))
        row.last = { at: new Date(Number(m.internalDate) || Date.now()).toISOString(), snippet: decodeSnippet(m.snippet ?? '') || headerOf(m.payload, 'Subject') || '', fromName: mine ? 'You' : from?.name || from?.email || '', mine }
      }
      return row
    })
    return rows.sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? ''))
  })
}

/**
 * One client's conversation: every Gmail message with its people, and every email the site sent them (as cards),
 * oldest first. Site emails are read fresh each time so the webhook's Delivered / Opened shows straight away.
 */
export async function getConversation(clientId: string, fresh = false): Promise<Conversation | null> {
  const dir = await mailDirectory(fresh)
  const c = dir.find((x) => x.id === clientId)
  if (!c) return null
  const [mail, siteEmails] = await Promise.all([gmailConversation(c, fresh), listSentEmails(clientId).catch((e) => (console.error('[emails] site emails failed', e), [] as SiteEmail[]))])
  // Projects a site email was about, when they're no longer open (paid, archived), still get a filter chip.
  const projects = [...mail.projects]
  for (const s of siteEmails) if (s.projectId && !projects.some((p) => p.id === s.projectId)) projects.push({ id: s.projectId, title: s.projectTitle || 'Project', href: `/admin/projects/${encodeURIComponent(s.projectId)}` })
  return { ...mail, projects, siteEmails }
}

async function gmailConversation(c: DirClient, fresh: boolean): Promise<Omit<Conversation, 'siteEmails'>> {
  const clientId = c.id
  if (adminSampleMode()) return (await import('./mail-samples')).sampleConversation(c)
  const own = await ownAddress()
  return cached(`conv|${clientId}`, fresh, async () => {
    if (!c.people.length) return { clientId, clientName: c.name, people: [], projects: c.projects, messages: [] }
    const emails = c.people.map((p) => p.email)
    const [refs, unread] = await Promise.all([search(gmailQueries(emails), MAIL_LIMITS.messages + 1), search(gmailQueries(emails, 'is:unread'), 100)])
    const unreadIds = new Set(unread.map((r) => r.id))
    const shown = refs.slice(0, MAIL_LIMITS.messages)
    const messages = await pool(shown, 5, async (r) => {
      const m = parsed.get(r.id) ?? parse(await gmail<GMessage>(`/messages/${r.id}?format=full`), own)
      const { labels: _labels, ...rest } = m
      return { ...rest, unread: unreadIds.has(r.id) }
    })
    const people = c.people.map((p) => p.email)
    // Only what really is with this client's people (Gmail search can be loose, e.g. on display names).
    const kept = messages.filter((m) => matchClients([m.from, ...m.to, ...m.cc], [{ id: clientId, emails: people }]).length)
    return { clientId, clientName: c.name, people: c.people, projects: c.projects, messages: kept.sort((a, b) => a.at.localeCompare(b.at)), more: refs.length > MAIL_LIMITS.messages || undefined }
  })
}

/** Opening a conversation marks its unread messages read in Gmail too. */
export async function markRead(clientId: string): Promise<number> {
  if (adminSampleMode()) return (await import('./mail-samples')).markSampleRead(clientId)
  const c = (await mailDirectory()).find((x) => x.id === clientId)
  if (!c?.people.length) return 0
  const ids = (await search(gmailQueries(c.people.map((p) => p.email), 'is:unread'), 500)).map((r) => r.id)
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 500) await gmail(`/messages/batchModify`, { method: 'POST', body: JSON.stringify({ ids: ids.slice(i, i + 500), removeLabelIds: ['UNREAD'] }) })
    forget()
  }
  return ids.length
}

/** For the sidebar badge: unread mail from anyone at any client, in a handful of searches. */
export async function unreadCount(): Promise<number> {
  const state = await mailState()
  if (state === 'sample') return (await import('./mail-samples')).sampleUnread()
  if (state !== 'ready') return 0
  return cached('unread', false, async () => {
    const emails = [...new Set((await mailDirectory()).flatMap((c) => c.people.map((p) => p.email)))]
    if (!emails.length) return 0
    // Unread mail is mail they sent, so From is enough.
    const queries = gmailQueries(emails, 'is:unread', 30, ['from'])
    return (await search(queries, 99)).length
  })
}

/* ── Attachments ──────────────────────────────────────────────────── */

export async function fetchAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const r = await gmail<{ data?: string }>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)
  return Buffer.from((r.data ?? '').replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/* ── Sending ──────────────────────────────────────────────────────── */

const OUT_PREFIX = 'mail-out/'
export const outKeyOk = (k: string) => /^mail-out\/[0-9a-f]{32}\/[^/\\]{1,200}$/.test(k)

/** A short-lived address the browser PUTs one big attachment to, before sending. */
export function attachmentUploadUrl(name: string) {
  if (!r2Ready()) throw new MailInputError('Big attachments need the R2 bucket, which isn’t set up. Send files under 3 MB in all.')
  const key = `${OUT_PREFIX}${randomBytes(16).toString('hex')}/${name.replace(/[/\\\u0000-\u001f]/g, '_').slice(0, 200) || 'file'}`
  return { key, url: r2Url('PUT', key, 900) }
}

function r2Url(method: string, key: string, expires: number) {
  return presign({ method, host: `${r2Env.accountId}.r2.cloudflarestorage.com`, path: `/${r2Env.bucket}/${key}`, expires, accessKeyId: r2Env.accessKeyId, secretAccessKey: r2Env.secretAccessKey, region: 'auto' })
}

export type SendInput = {
  clientId: string
  to: string[]
  cc?: string[]
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string
  references?: string
  files: { name: string; type: string; data?: string; key?: string }[]
}

/** Sends through Gmail and returns the message as the conversation shows it. */
export async function sendMail(input: SendInput): Promise<MailMessage> {
  const dir = await mailDirectory()
  const client = dir.find((c) => c.id === input.clientId)
  if (!client) throw new MailInputError('That client isn’t in the back office.')
  const own = await ownAddress()
  const files: OutFile[] = []
  let total = 0
  for (const f of input.files) {
    let data: Uint8Array
    if (f.data) data = Buffer.from(f.data, 'base64')
    else if (f.key && outKeyOk(f.key) && !adminSampleMode()) {
      const res = await fetch(r2Url('GET', f.key, 300), { cache: 'no-store' })
      if (!res.ok) throw new MailInputError(`“${f.name}” didn’t finish uploading. Attach it again.`)
      data = new Uint8Array(await res.arrayBuffer())
    } else if (f.key && adminSampleMode()) data = new Uint8Array(0)
    else throw new MailInputError(`“${f.name}” didn’t come through. Attach it again.`)
    total += data.byteLength
    if (total > MAIL_LIMITS.files + 1024) throw new MailInputError('Attachments are over 20 MB in all.')
    files.push({ name: f.name, type: f.type, data })
  }
  const raw = buildMime({ to: input.to, cc: input.cc, subject: input.subject, body: input.body, inReplyTo: input.inReplyTo, references: input.references, files })
  const at = new Date().toISOString()
  const toAddr = (e: string) => client.people.find((p) => p.email === e) ?? { name: e, email: e }
  if (adminSampleMode()) {
    return {
      id: `sample-${Date.now()}`,
      threadId: input.threadId ?? `sample-t-${Date.now()}`,
      at,
      from: { name: 'Josh Ferguson', email: own },
      to: input.to.map(toAddr),
      cc: (input.cc ?? []).map(toAddr),
      subject: input.subject,
      mine: true,
      unread: false,
      body: { kind: 'text', main: input.body },
      files: input.files.map((f, i) => ({ id: `s${i}`, name: f.name, size: files[i]?.data.byteLength ?? 0, type: f.type })),
    }
  }
  // Multipart upload: the thread id as JSON, then the message itself (up to 35 MB, more than the plain endpoint allows).
  const boundary = `bi_up_${randomBytes(12).toString('hex')}`
  const meta = input.threadId ? { threadId: input.threadId } : {}
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: message/rfc822\r\n\r\n`),
    Buffer.from(raw, 'utf8'),
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const sent = await gmail<{ id: string; threadId: string }>(UPLOAD, { method: 'POST', body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } })
  // The uploaded copies have done their job.
  await Promise.all(input.files.filter((f) => f.key && outKeyOk(f.key)).map((f) => fetch(r2Url('DELETE', f.key!, 300), { method: 'DELETE' }).catch(() => null)))
  forget()
  try {
    const { labels: _labels, ...m } = parse(await gmail<GMessage>(`/messages/${sent.id}?format=full`), own)
    return { ...m, unread: false }
  } catch {
    return { id: sent.id, threadId: sent.threadId, at, from: { name: 'You', email: own }, to: input.to.map(toAddr), cc: (input.cc ?? []).map(toAddr), subject: input.subject, mine: true, unread: false, body: { kind: 'text', main: input.body }, files: [] }
  }
}
