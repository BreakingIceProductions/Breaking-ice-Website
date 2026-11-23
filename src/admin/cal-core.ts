/**
 * The calendar's pure helpers: Mountain-time maths, iCalendar (RFC 5545) reading and writing, and the
 * CalDAV (RFC 4791) XML that iCloud speaks. No imports, no server-only, so the browser can use the time
 * helpers and a plain `node` script can test the rest.
 */

export const CAL_TZ = 'America/Edmonton'

/* ── Time zones ───────────────────────────────────────────────────────── */

const fmts = new Map<string, Intl.DateTimeFormat>()
function fmtFor(tz: string): Intl.DateTimeFormat {
  let f = fmts.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      // A zone name Intl doesn't know (e.g. Outlook's "Mountain Standard Time"): use ours.
      f = fmtFor(CAL_TZ)
    }
    fmts.set(tz, f)
  }
  return f
}

/** Wall-clock parts of a moment in a time zone. */
export function wallParts(ms: number, tz = CAL_TZ) {
  const p: Record<string, number> = {}
  for (const x of fmtFor(tz).formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return { y: p.year, m: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, mi: p.minute, s: p.second }
}

const offsetAt = (ms: number, tz: string) => {
  const w = wallParts(ms, tz)
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000
}

/** A wall-clock date and time in a zone, as epoch ms. Handles daylight saving. */
export function zonedToUtc(day: string, time = '00:00', tz = CAL_TZ) {
  const [y, m, d] = day.split('-').map(Number)
  const [h = 0, mi = 0, s = 0] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi, s)
  let t = guess - offsetAt(guess, tz)
  t = guess - offsetAt(t, tz)
  return t
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** "YYYY-MM-DD" of a moment, in Mountain time (or the given zone). */
export const localDay = (ms: number, tz = CAL_TZ) => {
  const w = wallParts(ms, tz)
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`
}

/** "HH:mm" (24-hour) of a moment, in Mountain time. */
export const localTime = (ms: number, tz = CAL_TZ) => {
  const w = wallParts(ms, tz)
  return `${pad(w.h)}:${pad(w.mi)}`
}

export const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
/** 0 = Sunday. */
export const dayOfWeek = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()
export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))
export const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

/* ── iCalendar ────────────────────────────────────────────────────────── */

export type IcsProp = { name: string; params: Record<string, string>; value: string }
/** A date-only value (all day) or a moment. `tz` is the zone it was written in, for repeating it. */
export type IcsDate = { allDay: true; day: string } | { allDay: false; ms: number; tz: string }

export function unfold(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r\n|\n|\r/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1)
    else if (line) out.push(line)
  }
  return out
}

/** Splits on `sep`, ignoring separators inside double quotes. */
function splitOutsideQuotes(s: string, sep: string) {
  const out: string[] = []
  let q = false
  let cur = ''
  for (const ch of s) {
    if (ch === '"') q = !q
    if (ch === sep && !q) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

export function parseProp(line: string): IcsProp {
  let q = false
  let at = -1
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') q = !q
    else if (line[i] === ':' && !q) {
      at = i
      break
    }
  }
  const left = at < 0 ? line : line.slice(0, at)
  const value = at < 0 ? '' : line.slice(at + 1)
  const [name, ...rest] = splitOutsideQuotes(left, ';')
  const params: Record<string, string> = {}
  for (const p of rest) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), params, value }
}

export const unescapeText = (v: string) => v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
export const escapeText = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Folds a content line at 75 octets, as RFC 5545 asks (never splitting a UTF-8 character). */
export function fold(line: string) {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = parts.length ? 74 : 75
    if (bytes + b > limit) {
      parts.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += b
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

export const icsUtc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsDay = (day: string) => day.replace(/-/g, '')

export function parseIcsDate(p: IcsProp | undefined): IcsDate | null {
  if (!p) return null
  const v = p.value.trim().split(',')[0]
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v)
  if (!m) return null
  const day = `${m[1]}-${m[2]}-${m[3]}`
  if (!m[4] || p.params.VALUE === 'DATE') return { allDay: true, day }
  const time = `${m[4]}:${m[5]}:${m[6]}`
  if (m[7]) return { allDay: false, ms: Date.parse(`${day}T${time}Z`), tz: 'UTC' }
  const tz = p.params.TZID || CAL_TZ
  return { allDay: false, ms: zonedToUtc(day, time, tz), tz }
}

/** All the dates in an EXDATE / RDATE property (they can be comma-separated). */
function parseIcsDates(p: IcsProp): IcsDate[] {
  return p.value
    .split(',')
    .map((v) => parseIcsDate({ ...p, value: v }))
    .filter((d): d is IcsDate => Boolean(d))
}

/** "PT1H30M", "P1D", "-P1W" → ms. */
export function parseDuration(v: string) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim())
  if (!m) return 0
  const n = (i: number) => Number(m[i] || 0)
  const ms = (((n(2) * 7 + n(3)) * 24 + n(4)) * 60 + n(5)) * 60_000 + n(6) * 1000
  return m[1] === '-' ? -ms : ms
}

export type VEvent = {
  uid: string
  summary: string
  location?: string
  description?: string
  start: IcsDate
  end?: IcsDate
  duration?: number
  rrule?: string
  exdates: IcsDate[]
  recurrenceId?: IcsDate
  status?: string
}

/** Every VEVENT in a VCALENDAR, ignoring what's nested inside them (alarms). */
export function parseVEvents(ics: string): VEvent[] {
  const out: VEvent[] = []
  let depth = 0
  let props: IcsProp[] | null = null
  for (const line of unfold(ics)) {
    const p = parseProp(line)
    if (p.name === 'BEGIN') {
      if (p.value.toUpperCase() === 'VEVENT' && !props) {
        props = []
        depth = 0
      } else if (props) depth++
      continue
    }
    if (p.name === 'END') {
      if (props && depth > 0) depth--
      else if (props && p.value.toUpperCase() === 'VEVENT') {
        const ev = toVEvent(props)
        if (ev) out.push(ev)
        props = null
      }
      continue
    }
    if (props && depth === 0) props.push(p)
  }
  return out
}

function toVEvent(props: IcsProp[]): VEvent | null {
  const get = (n: string) => props.find((p) => p.name === n)
  const start = parseIcsDate(get('DTSTART'))
  if (!start) return null
  const text = (n: string) => {
    const p = get(n)
    return p ? unescapeText(p.value) : undefined
  }
  const dur = get('DURATION')
  return {
    uid: get('UID')?.value ?? '',
    summary: text('SUMMARY') ?? '',
    location: text('LOCATION') || undefined,
    description: text('DESCRIPTION') || undefined,
    start,
    end: parseIcsDate(get('DTEND')) ?? undefined,
    duration: dur ? parseDuration(dur.value) : undefined,
    rrule: get('RRULE')?.value,
    exdates: props.filter((p) => p.name === 'EXDATE').flatMap(parseIcsDates),
    recurrenceId: parseIcsDate(get('RECURRENCE-ID')) ?? undefined,
    status: get('STATUS')?.value.toUpperCase(),
  }
}

/** Start and end as the calendar uses them: all-day "YYYY-MM-DD" with the end exclusive, or ISO moments. */
export type Span = { allDay: boolean; start: string; end: string }

export function spanOf(start: IcsDate, end?: IcsDate, duration?: number): Span {
  if (start.allDay) {
    let last = end?.allDay ? end.day : duration ? addDay(start.day, Math.max(1, Math.round(duration / 86_400_000))) : addDay(start.day, 1)
    if (last <= start.day) last = addDay(start.day, 1)
    return { allDay: true, start: start.day, end: last }
  }
  const endMs = end && !end.allDay ? end.ms : end?.allDay ? zonedToUtc(end.day, '00:00', start.tz === 'UTC' ? CAL_TZ : start.tz) : start.ms + (duration ?? 0)
  return { allDay: false, start: new Date(start.ms).toISOString(), end: new Date(Math.max(endMs, start.ms)).toISOString() }
}

const sameDate = (a: IcsDate, b: IcsDate) => (a.allDay && b.allDay ? a.day === b.day : !a.allDay && !b.allDay ? Math.abs(a.ms - b.ms) < 1000 : a.allDay ? !b.allDay && localDay(b.ms) === a.day : localDay(a.ms) === (b as { day: string }).day)

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/**
 * Occurrences of a repeating event that start inside [fromMs, toMs). Covers what calendars write day to day:
 * DAILY / WEEKLY (with BYDAY) / MONTHLY (same date, or BYDAY like "2TU" / "-1FR") / YEARLY, INTERVAL, COUNT,
 * UNTIL and EXDATE. iCloud normally expands repeats itself (see calendarQueryBody); this is the fallback.
 */
export function expandRRule(ev: VEvent, fromMs: number, toMs: number, max = 400): IcsDate[] {
  if (!ev.rrule) return [ev.start]
  const r: Record<string, string> = {}
  for (const part of ev.rrule.split(';')) {
    const [k, v] = part.split('=')
    if (k && v) r[k.toUpperCase()] = v.toUpperCase()
  }
  const freq = r.FREQ
  const interval = Math.max(1, Number(r.INTERVAL) || 1)
  const count = r.COUNT ? Number(r.COUNT) : Infinity
  const untilD = r.UNTIL ? parseIcsDate({ name: 'UNTIL', params: {}, value: r.UNTIL }) : null
  const untilMs = untilD ? (untilD.allDay ? zonedToUtc(addDay(untilD.day, 1)) - 1 : untilD.ms) : Infinity
  const tz = ev.start.allDay ? CAL_TZ : ev.start.tz === 'UTC' ? CAL_TZ : ev.start.tz
  const startMs = ev.start.allDay ? zonedToUtc(ev.start.day) : ev.start.ms
  const startDay = ev.start.allDay ? ev.start.day : localDay(ev.start.ms, tz)
  const startTime = ev.start.allDay ? '00:00' : (() => {
    const w = wallParts(ev.start.ms, tz)
    return `${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}`
  })()
  const byday = (r.BYDAY ?? '').split(',').filter(Boolean)
  const at = (day: string): IcsDate => (ev.start.allDay ? { allDay: true, day } : { allDay: false, ms: zonedToUtc(day, startTime, tz), tz })
  const msOf = (d: IcsDate) => (d.allDay ? zonedToUtc(d.day) : d.ms)

  // Candidate days, in order, one period at a time.
  const periodDays = (k: number): string[] => {
    if (freq === 'DAILY') return [addDay(startDay, k * interval)]
    if (freq === 'WEEKLY') {
      const weekStart = addDay(startDay, k * 7 * interval - dayOfWeek(startDay))
      const days = byday.length ? byday.map((b) => WEEKDAYS.indexOf(b.slice(-2))).filter((i) => i >= 0) : [dayOfWeek(startDay)]
      return [...new Set(days)].sort((a, b) => a - b).map((i) => addDay(weekStart, i))
    }
    if (freq === 'MONTHLY' || freq === 'YEARLY') {
      const [y0, m0] = startDay.split('-').map(Number)
      const months = freq === 'MONTHLY' ? (m0 - 1) + k * interval : (m0 - 1) + k * 12 * interval
      const y = y0 + Math.floor(months / 12)
      const m = (months % 12) + 1
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const first = `${y}-${pad(m)}-01`
      if (byday.length) {
        const out: string[] = []
        for (const b of byday) {
          const wd = WEEKDAYS.indexOf(b.slice(-2))
          const n = Number(b.slice(0, -2) || 0)
          if (wd < 0) continue
          const all: string[] = []
          for (let d = 1; d <= dim; d++) {
            const day = `${y}-${pad(m)}-${pad(d)}`
            if (dayOfWeek(day) === wd) all.push(day)
          }
          if (!n) out.push(...all)
          else {
            const pick = n > 0 ? all[n - 1] : all[all.length + n]
            if (pick) out.push(pick)
          }
        }
        return out.sort()
      }
      const want = Number(r.BYMONTHDAY || startDay.slice(8))
      const d = want < 0 ? dim + want + 1 : want
      // Skip months without that date (Feb 30th), as calendars do.
      return d >= 1 && d <= dim ? [addDay(first, d - 1)] : []
    }
    return []
  }
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return [ev.start]

  const out: IcsDate[] = []
  let n = 0
  for (let k = 0; k < 5000 && n < count && out.length < max; k++) {
    const days = periodDays(k)
    let past = false
    for (const day of days) {
      if (day < startDay) continue
      const occ = at(day)
      const ms = msOf(occ)
      if (ms > untilMs) {
        past = true
        break
      }
      n++
      if (n > count) break
      if (ms >= toMs) {
        past = true
        break
      }
      if (ms >= fromMs - 1 && !ev.exdates.some((x) => sameDate(x, occ))) out.push(occ)
    }
    if (past) break
    if (k > 0 && msOf(at(days[0] ?? startDay)) > toMs && days.length) break
  }
  // DTSTART is always the first occurrence, even if the rule wouldn't produce it.
  if (startMs >= fromMs && startMs < toMs && !out.some((o) => sameDate(o, ev.start)) && !ev.exdates.some((x) => sameDate(x, ev.start))) out.unshift(ev.start)
  return out
}

export type Occurrence = Span & { uid: string; summary: string; location?: string; description?: string; recurring: boolean; occurrence?: string }

/**
 * One calendar resource (a .ics) to the occurrences inside a range: a plain event, the occurrences iCloud
 * expanded, or (fallback) a master event with its rule expanded here and its edited occurrences swapped in.
 */
export function occurrencesOf(ics: string, fromMs: number, toMs: number): Occurrence[] {
  const evs = parseVEvents(ics).filter((e) => e.status !== 'CANCELLED')
  const masters = evs.filter((e) => !e.recurrenceId)
  const overrides = evs.filter((e) => e.recurrenceId)
  const out: Occurrence[] = []
  const occ = (e: VEvent, start: IcsDate, recurring: boolean, id?: IcsDate): Occurrence => {
    const base = spanOf(e.start, e.end, e.duration)
    const len = base.allDay ? dayDiff(base.start, base.end) : Date.parse(base.end) - Date.parse(base.start)
    const span: Span = start.allDay
      ? { allDay: true, start: start.day, end: addDay(start.day, Math.max(1, len)) }
      : { allDay: false, start: new Date(start.ms).toISOString(), end: new Date(start.ms + len).toISOString() }
    return {
      ...span,
      uid: e.uid,
      summary: e.summary,
      location: e.location,
      description: e.description,
      recurring,
      occurrence: id ? (id.allDay ? id.day : icsUtc(id.ms)) : undefined,
    }
  }
  const overlaps = (s: Span) => {
    const a = s.allDay ? zonedToUtc(s.start) : Date.parse(s.start)
    const b = s.allDay ? zonedToUtc(s.end) : Date.parse(s.end)
    return a < toMs && (b > fromMs || (a === b && a >= fromMs))
  }
  for (const m of masters) {
    if (!m.rrule) {
      const o = occ(m, m.start, false)
      if (overlaps(o)) out.push(o)
      continue
    }
    // Look back far enough to catch a long event that started before the range.
    const base = spanOf(m.start, m.end, m.duration)
    const len = base.allDay ? dayDiff(base.start, base.end) * 86_400_000 : Date.parse(base.end) - Date.parse(base.start)
    for (const d of expandRRule(m, fromMs - len, toMs)) {
      if (overrides.some((o) => o.recurrenceId && sameDate(o.recurrenceId, d))) continue
      const o = occ(m, d, true, d)
      if (overlaps(o)) out.push(o)
    }
  }
  for (const e of overrides) {
    const o = occ(e, e.start, true, e.recurrenceId)
    if (overlaps(o)) out.push(o)
  }
  return out
}

export type EventFields = { title: string; allDay: boolean; start: string; end: string; location?: string; notes?: string }

function fieldLines(f: EventFields) {
  const lines: string[] = [`SUMMARY:${escapeText(f.title)}`]
  if (f.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDay(f.start)}`, `DTEND;VALUE=DATE:${icsDay(f.end)}`)
  } else {
    // Written in UTC: no VTIMEZONE needed, and every calendar shows it in its own zone.
    lines.push(`DTSTART:${icsUtc(Date.parse(f.start))}`, `DTEND:${icsUtc(Date.parse(f.end))}`)
  }
  if (f.location) lines.push(`LOCATION:${escapeText(f.location)}`)
  if (f.notes) lines.push(`DESCRIPTION:${escapeText(f.notes)}`)
  return lines
}

/** A new VCALENDAR holding one event. */
export function buildIcs(uid: string, f: EventFields, now = Date.now()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Breaking Ice Productions//Back office//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsUtc(now)}`,
    `CREATED:${icsUtc(now)}`,
    `LAST-MODIFIED:${icsUtc(now)}`,
    'SEQUENCE:0',
    ...fieldLines(f),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/**
 * Changes an existing (non-repeating) event in place: title, times, location and notes are replaced, and
 * everything else in the file (alarms, attendees, URL, Apple's own fields) is kept as it was.
 */
export function patchIcs(ics: string, f: EventFields, now = Date.now()) {
  const lines = unfold(ics)
  const out: string[] = []
  let inEvent = false
  let depth = 0
  let done = false
  const REPLACED = new Set(['SUMMARY', 'DTSTART', 'DTEND', 'DURATION', 'LOCATION', 'DESCRIPTION', 'DTSTAMP', 'LAST-MODIFIED', 'SEQUENCE'])
  let seq = 0
  for (const line of lines) {
    const p = parseProp(line)
    if (!done && !inEvent && p.name === 'BEGIN' && p.value.toUpperCase() === 'VEVENT') {
      inEvent = true
      depth = 0
      out.push(line)
      continue
    }
    if (inEvent) {
      if (p.name === 'BEGIN') depth++
      if (p.name === 'END') {
        if (depth > 0) depth--
        else {
          if (!done) {
            out.push(`DTSTAMP:${icsUtc(now)}`, `LAST-MODIFIED:${icsUtc(now)}`, `SEQUENCE:${seq + 1}`, ...fieldLines(f))
            done = true
          }
          inEvent = false
          out.push(line)
          continue
        }
      }
      if (depth === 0 && p.name === 'RRULE') throw new Error('repeating')
      if (depth === 0 && p.name === 'SEQUENCE') seq = Number(p.value) || 0
      if (depth === 0 && REPLACED.has(p.name)) continue
    }
    out.push(line)
  }
  if (!done) throw new Error('no event in this file')
  return out.map(fold).join('\r\n') + '\r\n'
}

/* ── CalDAV XML ───────────────────────────────────────────────────────── */

export type DavResponse = { href: string; props: Record<string, string> }

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
export const xmlDecode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? all),
  )
export const xmlEncode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A WebDAV multistatus reply to one entry per resource, with the properties that came back 200 OK.
 * Namespace prefixes are dropped (servers pick their own: d:, D:, or a default namespace). Property
 * values are the raw inner XML; read text ones with `xmlText`.
 */
export function parseMultistatus(xml: string): DavResponse[] {
  // CDATA → escaped text, so the tag matching below can't trip on what's inside.
  const clean = xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) => xmlEncode(t))
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1')
  const out: DavResponse[] = []
  for (const r of clean.matchAll(/<response\b[^>]*>([\s\S]*?)<\/response>/g)) {
    const body = r[1]
    const href = xmlDecode((/<href\b[^>]*>([\s\S]*?)<\/href>/.exec(body)?.[1] ?? '').trim())
    const props: Record<string, string> = {}
    for (const ps of body.matchAll(/<propstat\b[^>]*>([\s\S]*?)<\/propstat>/g)) {
      const status = /<status\b[^>]*>([\s\S]*?)<\/status>/.exec(ps[1])?.[1] ?? ''
      if (!/\s2\d\d\b/.test(status)) continue
      const prop = /<prop\b[^>]*>([\s\S]*)<\/prop>/.exec(ps[1])?.[1] ?? ''
      for (const c of prop.matchAll(/<([\w-]+)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1\s*>)/g)) props[c[1]] = c[2] ?? ''
    }
    out.push({ href, props })
  }
  return out
}

export const xmlText = (inner?: string) => (inner ? xmlDecode(inner.replace(/<[^>]+>/g, '')).trim() : '')
export const xmlHrefs = (inner?: string) => [...(inner ?? '').matchAll(/<href\b[^>]*>([\s\S]*?)<\/href>/g)].map((m) => xmlDecode(m[1].trim()))

export function propfindBody(props: string[]) {
  return `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/">
  <d:prop>${props.map((p) => `<${p}/>`).join('')}</d:prop>
</d:propfind>`
}

/** Events overlapping [from, to), with repeats expanded by the server into single occurrences. */
export function calendarQueryBody(fromMs: number, toMs: number, expand = true) {
  const a = icsUtc(fromMs)
  const b = icsUtc(toMs)
  return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    ${expand ? `<c:calendar-data><c:expand start="${a}" end="${b}"/></c:calendar-data>` : '<c:calendar-data/>'}
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${a}" end="${b}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`
}
