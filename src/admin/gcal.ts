import 'server-only'
import { SITE_URL } from '@/lib/site'
import type { CalEvent, CalInfo } from './cal-shared'
import { adminEnv, googleOAuthReady } from './config'
import { getConnection, saveConnection } from './data'

/**
 * Josh's own Google calendars, through Google sign-in (OAuth) done once in Settings. The refresh token is
 * kept encrypted in the owner-only "bo-secrets" record like Zoho's; access tokens last an hour and are
 * renewed from it. Every calendar on the account is listed each time, so new ones appear on their own.
 * (The "Breaking Ice Projects" calendar the service account writes to is separate: see calendar.ts.)
 */

// Read and write events on every calendar, list the calendars, and the address (to show which account).
// Gmail: read client mail and mark it read (modify), and send replies from Josh's own mailbox (send). See gmail.ts.
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send']
const SCOPES = ['https://www.googleapis.com/auth/calendar', ...GMAIL_SCOPES, 'openid', 'email'].join(' ')
const API = 'https://www.googleapis.com/calendar/v3'

/** Google only sends people back to addresses registered on the OAuth client: the live site, or localhost in development. */
export function googleRedirect(reqUrl?: string) {
  const u = reqUrl ? new URL(reqUrl) : null
  const local = u && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)
  return `${local ? u.origin : SITE_URL}/api/admin/google/callback`
}

/** `scope` is what Google says was granted (space separated); connections made before email was added have none. */
type Conn = { access: string; refresh: string; exp: number; email?: string; connectedAt: string; scope?: string }

/** True when this sign-in allowed reading and sending email (both Gmail scopes). */
export const hasGmailScope = (c: { scope?: string } | null | undefined) => {
  const granted = new Set((c?.scope ?? '').split(/\s+/))
  return GMAIL_SCOPES.every((s) => granted.has(s))
}

export function googleAuthorizeUrl(state: string, reqUrl: string) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.search = new URLSearchParams({
    client_id: adminEnv.googleOAuthId,
    redirect_uri: googleRedirect(reqUrl),
    response_type: 'code',
    scope: SCOPES,
    // offline + consent is what gets a refresh token back.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString()
  return u.toString()
}

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string; error?: string; error_description?: string }

export class GoogleAuthError extends Error {}

async function token(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: adminEnv.googleOAuthId, client_secret: adminEnv.googleOAuthSecret, ...body }),
    cache: 'no-store',
  })
  const t = (await res.json().catch(() => ({}))) as TokenReply
  if (t.error === 'invalid_grant') throw new GoogleAuthError('Google signed this site out. Connect Google again in Settings.')
  if (!res.ok || t.error || !t.access_token) throw new Error(`google token ${res.status}: ${t.error ?? 'no access token'}`)
  return t as TokenReply & { access_token: string; expires_in: number }
}

/** The email in Google's ID token (it came straight from Google over TLS, so it isn't re-verified). */
function emailOf(idToken?: string) {
  try {
    const p = JSON.parse(Buffer.from((idToken ?? '').split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string }
    return typeof p.email === 'string' ? p.email : undefined
  } catch {
    return undefined
  }
}

export async function googleExchange(code: string, reqUrl: string) {
  const t = await token({ grant_type: 'authorization_code', code, redirect_uri: googleRedirect(reqUrl) })
  if (!t.refresh_token) throw new Error('Google didn’t return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.')
  await saveConnection('google', {
    access: t.access_token,
    refresh: t.refresh_token,
    exp: Date.now() + t.expires_in * 1000,
    email: emailOf(t.id_token),
    connectedAt: new Date().toISOString(),
    scope: t.scope,
  } satisfies Conn)
  cache.clear()
}

export async function googleConnection() {
  if (!googleOAuthReady()) return null
  return getConnection<Conn>('google')
}

let refreshing: Promise<Conn> | null = null

async function liveConnection(): Promise<Conn> {
  const c = await googleConnection()
  if (!c) throw new GoogleAuthError('Google isn’t connected')
  if (c.exp > Date.now() + 120_000) return c
  refreshing ??= (async () => {
    try {
      const t = await token({ grant_type: 'refresh_token', refresh_token: c.refresh })
      const next = { ...c, access: t.access_token, exp: Date.now() + t.expires_in * 1000, ...(t.scope && { scope: t.scope }) }
      await saveConnection('google', next)
      return next
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** A fresh access token for other Google APIs on the same sign-in (Gmail), with what it was granted. */
export async function googleAccess() {
  const c = await liveConnection()
  return { token: c.access, scope: c.scope, email: c.email }
}

export class GoogleConflict extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const c = await liveConnection()
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.access}`, 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  })
  if (res.status === 401) throw new GoogleAuthError('Google signed this site out. Connect Google again in Settings.')
  if (res.status === 412) throw new GoogleConflict('This event was changed somewhere else. Reload and try again.')
  if (res.status === 404 || res.status === 410) return null
  if (!res.ok) throw new Error(`google calendar ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.status === 204 ? null : ((await res.json()) as T)
}

/* ── Short cache: flipping between weeks shouldn't call Google every time ── */
const cache = new Map<string, { at: number; value: unknown }>()
const TTL = 60_000
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 200) cache.delete(cache.keys().next().value as string)
  return value
}
const forget = (calId: string) => {
  for (const k of cache.keys()) if (k === 'list' || k.startsWith(`ev|${calId}|`)) cache.delete(k)
}

type GCal = { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; accessRole?: string; primary?: boolean; hidden?: boolean; deleted?: boolean }

export const gcalId = (id: string) => `g:${id}`

export async function googleCalendars(): Promise<CalInfo[]> {
  return cached('list', async () => {
    const items: GCal[] = []
    let page = ''
    for (let i = 0; i < 10; i++) {
      const r = await call<{ items?: GCal[]; nextPageToken?: string }>(`/users/me/calendarList?minAccessRole=reader&maxResults=250${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`)
      items.push(...(r?.items ?? []))
      if (!r?.nextPageToken) break
      page = r.nextPageToken
    }
    return items
      .filter((c) => !c.deleted)
      .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)))
      .map((c) => ({
        id: gcalId(c.id),
        name: c.summaryOverride || c.summary || c.id,
        color: /^#[0-9a-f]{6}$/i.test(c.backgroundColor ?? '') ? (c.backgroundColor as string) : '#4285f4',
        source: 'google' as const,
        writable: c.accessRole === 'owner' || c.accessRole === 'writer',
        account: 'Google',
      }))
  })
}

type GTime = { date?: string; dateTime?: string; timeZone?: string }
type GEvent = {
  id: string
  status?: string
  summary?: string
  location?: string
  description?: string
  start?: GTime
  end?: GTime
  recurringEventId?: string
  htmlLink?: string
  etag?: string
  extendedProperties?: { private?: Record<string, string> }
}

function toEvent(calId: string, e: GEvent, writable: boolean): CalEvent | null {
  if (e.status === 'cancelled' || !e.start || !e.end) return null
  const allDay = Boolean(e.start.date)
  const start = allDay ? e.start.date : e.start.dateTime && new Date(e.start.dateTime).toISOString()
  const end = allDay ? e.end.date : e.end.dateTime && new Date(e.end.dateTime).toISOString()
  if (!start || !end) return null
  return {
    id: `${gcalId(calId)}|${e.id}`,
    calendarId: gcalId(calId),
    title: e.summary || '(No title)',
    allDay,
    start,
    end,
    location: e.location || undefined,
    notes: e.description || undefined,
    recurring: Boolean(e.recurringEventId),
    readOnly: !writable || undefined,
    readOnlyWhy: writable ? undefined : 'This calendar is shared with you read only.',
    link: e.htmlLink,
    etag: e.etag,
  }
}

/** Events overlapping [from, to) on one calendar. Repeats come back as single occurrences. */
export async function googleEvents(cal: CalInfo, fromMs: number, toMs: number): Promise<CalEvent[]> {
  const id = cal.id.slice(2)
  const from = new Date(fromMs).toISOString()
  const to = new Date(toMs).toISOString()
  return cached(`ev|${id}|${from}|${to}`, async () => {
    const out: CalEvent[] = []
    let page = ''
    for (let i = 0; i < 10; i++) {
      const qs = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', ...(page ? { pageToken: page } : {}) })
      const r = await call<{ items?: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(id)}/events?${qs}`)
      for (const e of r?.items ?? []) {
        // Project dates the service account mirrors to "Breaking Ice Projects" are already shown from the projects.
        if (e.extendedProperties?.private?.boProject) continue
        const ev = toEvent(id, e, cal.writable)
        if (ev) out.push(ev)
      }
      if (!r?.nextPageToken) break
      page = r.nextPageToken
    }
    return out
  })
}

export type GoogleWrite = { title: string; allDay: boolean; start: string; end: string; location?: string; notes?: string }

/** For a PATCH, the other kind of time is cleared with null, so timed ↔ all day switches cleanly. */
function body(w: GoogleWrite, patch = false) {
  const t = (v: string) => (w.allDay ? { date: v, ...(patch && { dateTime: null }) } : { dateTime: v, timeZone: adminEnv.timeZone, ...(patch && { date: null }) })
  return { summary: w.title, location: w.location ?? '', description: w.notes ?? '', start: t(w.start), end: t(w.end) }
}

export async function googleCreate(calId: string, w: GoogleWrite) {
  const id = calId.slice(2)
  const r = await call<GEvent>(`/calendars/${encodeURIComponent(id)}/events`, { method: 'POST', body: JSON.stringify(body(w)) })
  forget(id)
  if (!r) throw new Error('Google didn’t save the event')
  return r.id
}

export async function googleUpdate(calId: string, eventId: string, w: GoogleWrite, etag?: string) {
  const id = calId.slice(2)
  const r = await call<GEvent>(`/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body(w, true)),
    headers: etag ? { 'If-Match': etag } : {},
  })
  forget(id)
  if (!r) throw new Error('That event is no longer in Google Calendar')
}

/** Google to Google: move keeps the event (and its guests); then the edit is applied. */
export async function googleMove(fromCal: string, eventId: string, toCal: string) {
  const a = fromCal.slice(2)
  const b = toCal.slice(2)
  const r = await call<GEvent>(`/calendars/${encodeURIComponent(a)}/events/${encodeURIComponent(eventId)}/move?destination=${encodeURIComponent(b)}`, { method: 'POST' })
  forget(a)
  forget(b)
  if (!r) throw new Error('That event is no longer in Google Calendar')
  return r.id
}

export async function googleDelete(calId: string, eventId: string, etag?: string) {
  const id = calId.slice(2)
  await call(`/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE', headers: etag ? { 'If-Match': etag } : {} })
  forget(id)
}
