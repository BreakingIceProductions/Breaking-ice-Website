import 'server-only'
import { addDay, CAL_TZ, dayDiff, isDay, isTime, localDay, zonedToUtc, type EventFields } from './cal-core'
import { PROJECTS_CAL, type CalEvent, type CalFeed, type CalInfo, type CalSource, type EventInput } from './cal-shared'
import { IcloudConflict, IcloudError, icloudCalendars, icloudCreate, icloudDelete, icloudEvents, icloudUpdate } from './caldav'
import { wantedEvents } from './calendar'
import { adminSampleMode, googleOAuthReady, icloudReady } from './config'
import { getConnection, listProjects, saveConnection } from './data'
import { GoogleAuthError, GoogleConflict, googleCalendars, googleConnection, googleCreate, googleDelete, googleEvents, googleMove, googleUpdate } from './gcal'
import { pageHref } from './lead'

/**
 * The calendar page's one source of truth: Google calendars (OAuth), iCloud calendars (CalDAV) and the
 * back office's own project dates, merged into one list for a date range. Saves go back to the calendar
 * an event came from. In sample mode nothing is called: sample calendars live in memory.
 */

export class CalendarInputError extends Error {}
export { GoogleConflict, IcloudConflict }

const PROJECTS: CalInfo = { id: PROJECTS_CAL, name: 'Project dates', color: '#c9773f', source: 'project', writable: false, account: 'Back office' }

/* ── Settings: the calendar new events go to ─────────────────────────── */

type Prefs = { defaultCalendar?: string }

export async function calendarPrefs(): Promise<Prefs> {
  if (adminSampleMode()) return { defaultCalendar: sample().defaultCalendar }
  return (await getConnection<Prefs>('calendarPrefs').catch(() => null)) ?? {}
}

export async function setDefaultCalendar(id: string) {
  if (adminSampleMode()) {
    sample().defaultCalendar = id
    return
  }
  await saveConnection('calendarPrefs', { ...(await calendarPrefs()), defaultCalendar: id })
}

/* ── Project dates ───────────────────────────────────────────────────── */

async function projectEvents(fromDay: string, toDay: string): Promise<CalEvent[]> {
  const out: CalEvent[] = []
  for (const p of await listProjects()) {
    if (p.archived) continue
    for (const w of wantedEvents(p)) {
      const timed = isTime(w.time) && (!w.end || w.end === w.start)
      const last = w.end && w.end > w.start ? w.end : w.start
      if (last < fromDay || w.start >= toDay) continue
      const startMs = timed ? zonedToUtc(w.start, w.time) : 0
      const endWall = timed ? (() => {
        const [h, m] = (w.time as string).split(':').map(Number)
        return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      })() : ''
      out.push({
        id: `${PROJECTS_CAL}|${p._id}|${w.source}`,
        calendarId: PROJECTS_CAL,
        title: w.summary,
        allDay: !timed,
        start: timed ? new Date(startMs).toISOString() : w.start,
        end: timed ? new Date(startMs + 3_600_000).toISOString() : addDay(last, 1),
        ...(timed && { wall: { start: `${w.start}T${w.time}`, end: `${w.start}T${endWall}` } }),
        location: w.location,
        readOnly: true,
        readOnlyWhy: 'Project dates are changed on the project, so its schedule, TickTick and the project calendar stay in step.',
        projectHref: pageHref(p._id, p.pipelineStage),
        projectTitle: p.title,
      })
    }
  }
  return out
}

/* ── Sample mode: three calendars in memory ─────────────────────────── */

type SampleStore = { calendars: CalInfo[]; events: CalEvent[]; defaultCalendar: string; n: number }
const g = globalThis as unknown as { __biSampleCalendar?: SampleStore }

function sample(): SampleStore {
  if (g.__biSampleCalendar) return g.__biSampleCalendar
  const t = localDay(Date.now())
  const d = (n: number) => addDay(t, n)
  const at = (n: number, time: string) => `${d(n)}T${time}`
  const calendars: CalInfo[] = [
    { id: 's:work', name: 'Work', color: '#4285f4', source: 'google', writable: true, account: 'Google' },
    { id: 's:personal', name: 'Personal', color: '#34a853', source: 'google', writable: true, account: 'Google' },
    { id: 's:home', name: 'Home', color: '#ff2d55', source: 'icloud', writable: true, account: 'iCloud' },
    { id: 's:holidays', name: 'Holidays in Canada', color: '#8e8e93', source: 'google', writable: false, account: 'Google' },
  ]
  let n = 0
  // Timed samples are written as Mountain wall times; the browser works out the moments (see CalEvent.wall).
  const moment = (w: string) => new Date(zonedToUtc(w.slice(0, 10), w.slice(11))).toISOString()
  const ev = (cal: string, title: string, start: string, end: string, extra: Partial<CalEvent> = {}): CalEvent => {
    const allDay = start.length === 10
    return { id: `${cal}|e${++n}`, calendarId: cal, title, allDay, start: allDay ? start : moment(start), end: allDay ? end : moment(end), ...(!allDay && { wall: { start, end } }), ...extra }
  }
  const events: CalEvent[] = [
    ev('s:work', 'Call with Imperial (round 2 notes)', at(0, '10:00'), at(0, '10:45'), { location: 'Google Meet' }),
    ev('s:work', 'Colour pass: Turbine removal', at(0, '13:00'), at(0, '16:00')),
    ev('s:work', 'Edit block', at(1, '09:00'), at(1, '12:00')),
    ev('s:work', 'Lunch with SDEC board chair', at(2, '12:00'), at(2, '13:30'), { location: 'Javaroma, Yellowknife', notes: 'Bring the retainer leave-behind.' }),
    ev('s:work', 'Gear check and battery charge', at(3, '15:00'), at(3, '16:00')),
    ev('s:work', 'North-Wright monthly check-in', at(6, '11:00'), at(6, '11:30')),
    ev('s:work', 'Invoice day', d(8), d(9)),
    ev('s:work', 'Edit block', at(-2, '09:00'), at(-2, '12:30')),
    ev('s:work', 'Prep for Norman Wells', d(9), d(11)),
    ev('s:personal', 'Hockey', at(1, '19:30'), at(1, '21:00'), { location: 'Multiplex' }),
    ev('s:personal', 'Dentist', at(4, '08:30'), at(4, '09:30')),
    ev('s:personal', 'Run', at(-1, '07:00'), at(-1, '08:00')),
    ev('s:home', 'Flight to Edmonton', at(12, '06:40'), at(12, '08:55'), { location: 'YZF → YEG' }),
    ev('s:home', 'Family visiting', d(14), d(18)),
    ev('s:home', 'Snow tires', at(5, '10:00'), at(5, '11:00'), { location: 'Kal Tire' }),
    ev('s:holidays', 'Remembrance Day', '2026-11-11', '2026-11-12', { readOnly: true, readOnlyWhy: 'This calendar is shared with you read only.' }),
    ev('s:holidays', 'Christmas Day', '2026-12-25', '2026-12-26', { readOnly: true, readOnlyWhy: 'This calendar is shared with you read only.' }),
    ev('s:holidays', 'Boxing Day', '2026-12-26', '2026-12-27', { readOnly: true, readOnlyWhy: 'This calendar is shared with you read only.' }),
  ]
  // A weekly repeat, to show how repeats look (on iCloud they open in Apple Calendar).
  const monday = addDay(t, -((new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7))
  for (let w = -6; w <= 10; w++) {
    const day = addDay(monday, w * 7)
    events.push({
      ...ev('s:home', 'Recycling out', `${day}T07:30`, `${day}T07:45`),
      id: `s:home|weekly#${day}`,
      recurring: true,
      readOnly: true,
      readOnlyWhy: 'Repeating iCloud events are changed in Apple Calendar, so the whole series stays right.',
    })
  }
  g.__biSampleCalendar = { calendars, events, defaultCalendar: 's:work', n }
  return g.__biSampleCalendar
}

/* ── Reading ─────────────────────────────────────────────────────────── */

const overlaps = (e: CalEvent, fromMs: number, toMs: number) => {
  const a = e.allDay ? zonedToUtc(e.start) : Date.parse(e.start)
  const b = e.allDay ? zonedToUtc(e.end) : Date.parse(e.end)
  return a < toMs && b > fromMs
}

const problemText = (e: unknown, source: CalSource) => {
  if (e instanceof GoogleAuthError || e instanceof IcloudError) return e.message
  console.error(`[calendar] ${source} read failed`, e)
  return source === 'google' ? 'Google Calendar didn’t answer just now. Its events will be back on the next load.' : 'iCloud didn’t answer just now. Its events will be back on the next load.'
}

/** Every calendar that can be shown, and whether each account is connected. */
export async function allCalendars() {
  if (adminSampleMode()) return { calendars: [...sample().calendars, PROJECTS], problems: [], connected: { google: true, icloud: true } }
  const problems: CalFeed['problems'] = []
  const googleOn = googleOAuthReady() && Boolean(await googleConnection().catch(() => null))
  const [g1, i1] = await Promise.all([
    googleOn ? googleCalendars().catch((e) => (problems.push({ source: 'google', text: problemText(e, 'google') }), [])) : [],
    icloudReady() ? icloudCalendars().catch((e) => (problems.push({ source: 'icloud', text: problemText(e, 'icloud') }), [])) : [],
  ])
  return { calendars: [...g1, ...i1, PROJECTS], problems, connected: { google: googleOn, icloud: icloudReady() } }
}

/** Everything overlapping [fromDay, toDay) (toDay exclusive). */
export async function calendarFeed(fromDay: string, toDay: string, exact?: { fromMs: number; toMs: number }): Promise<CalFeed> {
  // The browser's range wins when it sends one (newer time-zone data); a day either side covers any drift.
  const fromMs = exact?.fromMs ?? zonedToUtc(fromDay)
  const toMs = exact?.toMs ?? zonedToUtc(toDay)
  const { defaultCalendar } = await calendarPrefs()
  if (adminSampleMode()) {
    const s = sample()
    return {
      calendars: [...s.calendars, PROJECTS],
      events: [...s.events.filter((e) => overlaps(e, fromMs, toMs)), ...(await projectEvents(fromDay, toDay))],
      problems: [],
      defaultCalendar,
      sample: true,
      connected: { google: true, icloud: true },
    }
  }
  const { calendars, problems, connected } = await allCalendars()
  const failed = new Set<CalSource>()
  const lists = await Promise.all(
    calendars.map((c) => {
      const load = c.source === 'google' ? googleEvents(c, fromMs, toMs) : c.source === 'icloud' ? icloudEvents(c, fromMs, toMs) : projectEvents(fromDay, toDay)
      return load.catch((e) => {
        if (!failed.has(c.source)) problems.push({ source: c.source, text: c.source === 'project' ? 'Project dates couldn’t be read just now.' : problemText(e, c.source) })
        failed.add(c.source)
        return [] as CalEvent[]
      })
    }),
  )
  const firstWritable = calendars.find((c) => c.writable)?.id
  return {
    calendars,
    events: lists.flat(),
    problems,
    defaultCalendar: calendars.some((c) => c.id === defaultCalendar && c.writable) ? defaultCalendar : firstWritable,
    sample: false,
    connected,
  }
}

/* ── Writing ─────────────────────────────────────────────────────────── */

/** Checks the drawer's input and turns Mountain wall times into the moments the calendars store. */
export function toFields(i: EventInput): EventFields {
  const title = i.title.trim()
  if (!title) throw new CalendarInputError('Give the event a title.')
  if (!isDay(i.startDay) || !isDay(i.endDay)) throw new CalendarInputError('Pick a start and end date.')
  if (i.endDay < i.startDay) throw new CalendarInputError('The end is before the start.')
  if (dayDiff(i.startDay, i.endDay) > 366) throw new CalendarInputError('Events can be up to a year long.')
  const base = { title, location: i.location?.trim() || undefined, notes: i.notes?.trim() || undefined }
  if (i.allDay) return { ...base, allDay: true, start: i.startDay, end: addDay(i.endDay, 1) }
  if (!isTime(i.startTime) || !isTime(i.endTime)) throw new CalendarInputError('Pick a start and end time.')
  // The browser's moments win (its time-zone data is newer); they must agree with the wall times to within a couple of hours.
  const near = (iso: string | undefined, guess: number) => {
    const t = iso ? Date.parse(iso) : NaN
    return Number.isFinite(t) && Math.abs(t - guess) <= 3 * 3_600_000 ? t : guess
  }
  const a = near(i.startAt, zonedToUtc(i.startDay, i.startTime, CAL_TZ))
  const b = near(i.endAt, zonedToUtc(i.endDay, i.endTime, CAL_TZ))
  if (b <= a) throw new CalendarInputError('The end time is before the start.')
  return { ...base, allDay: false, start: new Date(a).toISOString(), end: new Date(b).toISOString() }
}

/** "<calendar id>|<event ref>" → its parts. Calendar ids never contain "|". */
function splitId(id: string) {
  const at = id.indexOf('|')
  if (at < 1) throw new CalendarInputError('Unknown event.')
  return { calId: id.slice(0, at), ref: id.slice(at + 1) }
}

async function writableCalendar(id: string) {
  const { calendars } = await allCalendars()
  const c = calendars.find((x) => x.id === id)
  if (!c) throw new CalendarInputError('That calendar isn’t connected.')
  if (!c.writable) throw new CalendarInputError(c.source === 'project' ? 'Project dates are changed on the project.' : `“${c.name}” is read only.`)
  return c
}

async function createIn(c: CalInfo, f: EventFields) {
  if (c.source === 'google') return `${c.id}|${await googleCreate(c.id, f)}`
  return `${c.id}|${await icloudCreate(c.id, f)}`
}

async function deleteIn(c: CalInfo, ref: string, etag?: string) {
  if (c.source === 'google') await googleDelete(c.id, ref, etag)
  else await icloudDelete(c.id, ref, etag)
}

export async function createEvent(i: EventInput) {
  const f = toFields(i)
  if (adminSampleMode()) {
    const s = sample()
    const c = s.calendars.find((x) => x.id === i.calendarId && x.writable)
    if (!c) throw new CalendarInputError('Pick a calendar.')
    const ev: CalEvent = { id: `${c.id}|e${++s.n}`, calendarId: c.id, ...f }
    s.events.push(ev)
    return ev.id
  }
  return createIn(await writableCalendar(i.calendarId), f)
}

export async function updateEvent(id: string, i: EventInput, etag?: string) {
  const f = toFields(i)
  const { calId, ref } = splitId(id)
  if (adminSampleMode()) {
    const s = sample()
    const at = s.events.findIndex((e) => e.id === id)
    if (at < 0) throw new CalendarInputError('That event is gone. Reload the calendar.')
    if (s.events[at].readOnly) throw new CalendarInputError(s.events[at].readOnlyWhy ?? 'This event can’t be changed here.')
    const c = s.calendars.find((x) => x.id === i.calendarId && x.writable)
    if (!c) throw new CalendarInputError('Pick a calendar.')
    const next: CalEvent = { id: c.id === calId ? id : `${c.id}|e${++s.n}`, calendarId: c.id, ...f }
    s.events[at] = next
    return next.id
  }
  const from = await writableCalendar(calId)
  if (from.source === 'icloud' && ref.includes('#')) throw new CalendarInputError('Repeating iCloud events are changed in Apple Calendar.')
  if (i.calendarId === calId) {
    if (from.source === 'google') await googleUpdate(calId, ref, f, etag)
    else await icloudUpdate(calId, ref, f, etag)
    return id
  }
  // Moved to another calendar.
  const to = await writableCalendar(i.calendarId)
  if (from.source === 'google' && to.source === 'google') {
    const moved = await googleMove(calId, ref, to.id)
    await googleUpdate(to.id, moved, f)
    return `${to.id}|${moved}`
  }
  // Between Google and iCloud: a copy in the new calendar, then the old one is removed.
  const newId = await createIn(to, f)
  await deleteIn(from, ref, etag)
  return newId
}

export async function deleteEvent(id: string, etag?: string) {
  const { calId, ref } = splitId(id)
  if (adminSampleMode()) {
    const s = sample()
    const e = s.events.find((x) => x.id === id)
    if (e?.readOnly) throw new CalendarInputError(e.readOnlyWhy ?? 'This event can’t be deleted here.')
    s.events = s.events.filter((x) => x.id !== id)
    return
  }
  const c = await writableCalendar(calId)
  if (c.source === 'icloud' && ref.includes('#')) throw new CalendarInputError('Repeating iCloud events are deleted in Apple Calendar.')
  await deleteIn(c, ref, etag)
}
