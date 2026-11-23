import 'server-only'
import { randomUUID } from 'node:crypto'
import { buildIcs, calendarQueryBody, occurrencesOf, parseMultistatus, patchIcs, propfindBody, xmlHrefs, xmlText, type EventFields } from './cal-core'
import type { CalEvent, CalInfo } from './cal-shared'
import { adminEnv, icloudReady } from './config'

/**
 * Josh's iCloud (Apple) calendars over CalDAV, signed in with his Apple ID and an app-specific password
 * from Vercel (ICLOUD_APPLE_ID, ICLOUD_APP_PASSWORD). Nothing is stored: the password stays in Vercel.
 * Find the account's calendars → read events in a range (iCloud expands repeats) → PUT / DELETE one .ics.
 */

const ROOT = 'https://caldav.icloud.com/'
const auth = () => `Basic ${Buffer.from(`${adminEnv.icloudAppleId}:${adminEnv.icloudPassword}`).toString('base64')}`

export class IcloudError extends Error {}
export class IcloudConflict extends Error {}

async function dav(url: string, method: string, body?: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth(), ...(body ? { 'Content-Type': method === 'PUT' ? 'text/calendar; charset=utf-8' : 'application/xml; charset=utf-8' } : {}), ...headers },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 401 || res.status === 403) throw new IcloudError('iCloud didn’t accept the Apple ID and app-specific password. Make a new app-specific password and update ICLOUD_APP_PASSWORD in Vercel.')
  if (res.status === 412) throw new IcloudConflict('This event was changed somewhere else. Reload and try again.')
  return res
}

/** Absolute URL for an href the server gave (they're usually paths). Only ever iCloud's own hosts. */
function abs(href: string, base: string) {
  const u = new URL(href, base)
  if (u.protocol !== 'https:' || !/(^|\.)icloud\.com$/.test(u.hostname)) throw new IcloudError('iCloud sent an unexpected address.')
  return u.toString()
}

let home: { url: string; at: number } | null = null

/** The account's calendar home (e.g. https://p42-caldav.icloud.com/123456/calendars/), found once an hour. */
async function calendarHome() {
  if (home && Date.now() - home.at < 3_600_000) return home.url
  const r1 = await dav(ROOT, 'PROPFIND', propfindBody(['d:current-user-principal']), { Depth: '0' })
  if (!r1.ok && r1.status !== 207) throw new IcloudError(`iCloud didn’t answer (${r1.status}).`)
  const p = parseMultistatus(await r1.text())[0]
  const principal = xmlHrefs(p?.props['current-user-principal'])[0]
  if (!principal) throw new IcloudError('iCloud didn’t say which account this is.')
  const principalUrl = abs(principal, r1.url || ROOT)
  const r2 = await dav(principalUrl, 'PROPFIND', propfindBody(['c:calendar-home-set']), { Depth: '0' })
  const h = xmlHrefs(parseMultistatus(await r2.text())[0]?.props['calendar-home-set'])[0]
  if (!h) throw new IcloudError('iCloud didn’t say where the calendars are.')
  home = { url: abs(h, r2.url || principalUrl), at: Date.now() }
  return home.url
}

export const icalId = (url: string) => `i:${url}`

let listCache: { at: number; value: CalInfo[] } | null = null

export async function icloudCalendars(): Promise<CalInfo[]> {
  if (!icloudReady()) return []
  if (listCache && Date.now() - listCache.at < 60_000) return listCache.value
  const base = await calendarHome()
  const res = await dav(base, 'PROPFIND', propfindBody(['d:displayname', 'd:resourcetype', 'ic:calendar-color', 'c:supported-calendar-component-set', 'd:current-user-privilege-set']), { Depth: '1' })
  if (res.status !== 207) throw new IcloudError(`iCloud didn’t list the calendars (${res.status}).`)
  const out: CalInfo[] = []
  for (const r of parseMultistatus(await res.text())) {
    if (!/<calendar\b/.test(r.props.resourcetype ?? '')) continue
    const comps = r.props['supported-calendar-component-set']
    if (comps && !/name="VEVENT"/i.test(comps)) continue // Reminders lists
    const color = xmlText(r.props['calendar-color']).slice(0, 7)
    const priv = r.props['current-user-privilege-set']
    out.push({
      id: icalId(abs(r.href, base)),
      name: xmlText(r.props.displayname) || 'iCloud calendar',
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#ff2d55',
      source: 'icloud',
      writable: priv == null ? true : /<(write|write-content|all)\b/.test(priv),
      account: 'iCloud',
    })
  }
  listCache = { at: Date.now(), value: out }
  return out
}

const evCache = new Map<string, { at: number; value: CalEvent[] }>()

/** Events overlapping [from, to) on one iCloud calendar, repeats as single occurrences. */
export async function icloudEvents(cal: CalInfo, fromMs: number, toMs: number): Promise<CalEvent[]> {
  const url = cal.id.slice(2)
  const key = `${url}|${fromMs}|${toMs}`
  const hit = evCache.get(key)
  if (hit && Date.now() - hit.at < 60_000) return hit.value
  const res = await dav(url, 'REPORT', calendarQueryBody(fromMs, toMs), { Depth: '1' })
  if (res.status !== 207) throw new IcloudError(`iCloud didn’t send events (${res.status}).`)
  const out: CalEvent[] = []
  for (const r of parseMultistatus(await res.text())) {
    const ics = xmlText(r.props['calendar-data'])
    if (!ics) continue
    const href = abs(r.href, url)
    const etag = xmlText(r.props.getetag) || undefined
    for (const o of occurrencesOf(ics, fromMs, toMs)) {
      out.push({
        id: `${cal.id}|${href}${o.recurring && o.occurrence ? `#${o.occurrence}` : ''}`,
        calendarId: cal.id,
        title: o.summary || '(No title)',
        allDay: o.allDay,
        start: o.start,
        end: o.end,
        location: o.location,
        notes: o.description,
        recurring: o.recurring || undefined,
        readOnly: o.recurring || !cal.writable || undefined,
        readOnlyWhy: o.recurring ? 'Repeating iCloud events are changed in Apple Calendar, so the whole series stays right.' : !cal.writable ? 'This calendar is shared with you read only.' : undefined,
        etag,
      })
    }
  }
  evCache.set(key, { at: Date.now(), value: out })
  if (evCache.size > 200) evCache.delete(evCache.keys().next().value as string)
  return out
}

const forget = (calUrl: string) => {
  listCache = null
  for (const k of evCache.keys()) if (k.startsWith(`${calUrl}|`)) evCache.delete(k)
}

/** The resource URL in an event id ("i:<calendar>|<resource>"), checked to sit inside that calendar. */
export function icloudResource(calId: string, ref: string) {
  const calUrl = calId.slice(2)
  const href = abs(ref.split('#')[0], calUrl)
  if (!href.startsWith(calUrl)) throw new IcloudError('That event isn’t in this calendar.')
  return { calUrl, href }
}

export async function icloudCreate(calId: string, f: EventFields) {
  const calUrl = calId.slice(2)
  abs(calUrl, ROOT)
  const uid = `${randomUUID()}@breakingiceproductions.com`
  const href = `${calUrl.replace(/\/?$/, '/')}${encodeURIComponent(uid)}.ics`
  const res = await dav(href, 'PUT', buildIcs(uid, f), { 'If-None-Match': '*' })
  forget(calUrl)
  if (!res.ok) throw new IcloudError(`iCloud didn’t save the event (${res.status}).`)
  return href
}

export async function icloudUpdate(calId: string, ref: string, f: EventFields, etag?: string) {
  const { calUrl, href } = icloudResource(calId, ref)
  const got = await dav(href, 'GET')
  if (got.status === 404) throw new IcloudError('That event is no longer in iCloud.')
  if (!got.ok) throw new IcloudError(`iCloud didn’t send the event (${got.status}).`)
  const current = got.headers.get('etag') ?? undefined
  if (etag && current && etag !== current) throw new IcloudConflict('This event was changed somewhere else. Reload and try again.')
  let ics: string
  try {
    ics = patchIcs(await got.text(), f)
  } catch (e) {
    throw new IcloudError(e instanceof Error && e.message === 'repeating' ? 'Repeating iCloud events are changed in Apple Calendar.' : 'This event couldn’t be read, so it wasn’t changed.')
  }
  const res = await dav(href, 'PUT', ics, current ? { 'If-Match': current } : {})
  forget(calUrl)
  if (!res.ok) throw new IcloudError(`iCloud didn’t save the change (${res.status}).`)
}

export async function icloudDelete(calId: string, ref: string, etag?: string) {
  const { calUrl, href } = icloudResource(calId, ref)
  const res = await dav(href, 'DELETE', undefined, etag ? { 'If-Match': etag } : {})
  forget(calUrl)
  if (!res.ok && res.status !== 404) throw new IcloudError(`iCloud didn’t delete the event (${res.status}).`)
}
