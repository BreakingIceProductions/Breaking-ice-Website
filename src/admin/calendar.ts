import 'server-only'
import { createHash } from 'node:crypto'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'
import { adminEnv, calendarReady } from './config'
import { removeCalendarRecord, setCalendarRecord } from './data'
import { addDays } from './dates'
import { googleToken } from './google'
import { MILESTONE_LIST } from './milestones'
import type { OfficeProject } from './types'

/**
 * Google Calendar: every dated thing on a project becomes an event on the
 * "Breaking Ice Projects" calendar, which the service account can edit.
 * Each event remembers where it came from, so edits in the Studio move it,
 * removed dates delete it, and nothing is ever duplicated.
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const API = 'https://www.googleapis.com/calendar/v3'

export const MILESTONES = MILESTONE_LIST

// Google Calendar colour IDs: 9 blueberry, 8 graphite, 6 tangerine, 2 sage, 10 basil.
const COLOR: Record<string, string> = { shoot: '9', travel: '8', deadline: '6', meeting: '2', other: '8', done: '10' }

const stageIndex = (s: string) => PIPELINE_STAGES.findIndex((x) => x.value === s)

type Wanted = {
  source: string
  summary: string
  start: string
  end?: string
  time?: string
  location?: string
  color: string
}

/** Every event this project should have right now. */
export function wantedEvents(p: OfficeProject): Wanted[] {
  const name = `${p.title} (${p.client.organizationName})`
  const out: Wanted[] = []
  for (const m of MILESTONES) {
    const date = p.milestones[m.key]
    if (!date) continue
    const done = stageIndex(p.pipelineStage) >= stageIndex(m.doneFrom)
    out.push({ source: `ms-${m.key}`, summary: `${done ? '✓ ' : ''}${m.label} · ${name}`, start: date, color: done ? COLOR.done : COLOR.deadline })
  }
  for (const s of p.schedule) {
    const kind = s.kind ?? 'other'
    const label = kind === 'shoot' ? 'Shoot' : kind === 'travel' ? 'Travel' : kind === 'meeting' ? 'Meeting' : ''
    out.push({
      source: `sch-${s._key}`,
      summary: `${label ? `${label}: ` : ''}${s.title} · ${name}`,
      start: s.start,
      end: s.end,
      time: s.time,
      location: s.location,
      color: COLOR[kind] ?? COLOR.other,
    })
  }
  return out
}

const hashOf = (w: Wanted) => createHash('sha1').update(JSON.stringify(w)).digest('hex').slice(0, 16)

function body(p: OfficeProject, w: Wanted) {
  const tz = adminEnv.timeZone
  const timed = w.time && (!w.end || w.end === w.start)
  const [h, m] = (w.time ?? '00:00').split(':').map(Number)
  const endHour = `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return {
    summary: w.summary,
    location: w.location,
    description: `Breaking Ice back office: ${p.title}. Change this date in the project, not here (edits here are overwritten).`,
    colorId: w.color,
    start: timed ? { dateTime: `${w.start}T${w.time}:00`, timeZone: tz } : { date: w.start },
    // All-day events end on the day after their last day.
    end: timed ? { dateTime: `${w.start}T${endHour}:00`, timeZone: tz } : { date: addDays(w.end && w.end > w.start ? w.end : w.start, 1) },
    extendedProperties: { private: { boProject: p._id, boSource: w.source } },
    reminders: { useDefault: true },
  }
}

async function call<T>(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await googleToken(SCOPE)}`, 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  })
  if (res.status === 404 || res.status === 410) return { gone: true as const }
  if (!res.ok) throw new Error(`calendar ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return { gone: false as const, data: res.status === 204 ? (null as T) : ((await res.json()) as T) }
}

const cal = () => encodeURIComponent(adminEnv.calendarId)

/** Brings the calendar in line with the project. Returns what changed. */
export async function syncProjectCalendar(p: OfficeProject) {
  if (!calendarReady()) return { created: 0, updated: 0, removed: 0, skipped: 'not connected' as const }
  const wanted = wantedEvents(p)
  const have = new Map((p.office.calendar ?? []).map((r) => [r._key, r]))
  let created = 0
  let updated = 0
  let removed = 0

  for (const w of wanted) {
    const hash = hashOf(w)
    const rec = have.get(w.source)
    have.delete(w.source)
    if (rec && rec.hash === hash) continue
    if (rec) {
      const r = await call<{ id: string }>(`/calendars/${cal()}/events/${encodeURIComponent(rec.eventId)}`, { method: 'PUT', body: JSON.stringify(body(p, w)) })
      if (!r.gone) {
        await setCalendarRecord(p._id, w.source, rec.eventId, hash, true)
        updated++
        continue
      }
    }
    // New, or someone deleted it in Google Calendar: (re)create it.
    const r = await call<{ id: string }>(`/calendars/${cal()}/events`, { method: 'POST', body: JSON.stringify(body(p, w)) })
    if (!r.gone && r.data) {
      await setCalendarRecord(p._id, w.source, r.data.id, hash, Boolean(rec))
      created++
    }
  }

  // Dates that were removed from the project.
  for (const [source, rec] of have) {
    await call(`/calendars/${cal()}/events/${encodeURIComponent(rec.eventId)}`, { method: 'DELETE' })
    await removeCalendarRecord(p._id, source)
    removed++
  }
  return { created, updated, removed }
}
