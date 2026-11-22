/** Date helpers that work in Mountain time, whatever time zone the server runs in. */

export const TZ = 'America/Edmonton'

/** "YYYY-MM-DD" for a moment, in Mountain time. */
export const ymd = (d: Date | number = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export const today = () => ymd()

const noon = (date: string) => Date.parse(`${date}T12:00:00Z`)

export const addDays = (date: string, n: number) => new Date(noon(date) + n * 86_400_000).toISOString().slice(0, 10)

/** Whole days from a to b (b later = positive). */
export const daysBetween = (a: string, b: string) => Math.round((noon(b) - noon(a)) / 86_400_000)

export const fmtDay = (date?: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  date ? new Date(noon(date)).toLocaleDateString('en-CA', { ...opts, timeZone: 'UTC' }) : ''

export const fmtRange = (start: string, end?: string) => {
  if (!end || end === start) return fmtDay(start)
  const a = fmtDay(start)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  return `${a}–${sameMonth ? Number(end.slice(8)) : fmtDay(end)}`
}

export const weekday = (date: string) => fmtDay(date, { weekday: 'short' })

/** "3 days", "today", "1 day ago". */
export function relDays(from: string, to = today()) {
  const n = daysBetween(to, from)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

/** Days since an ISO timestamp, in Mountain time. */
export const daysSince = (iso?: string) => (iso ? daysBetween(ymd(new Date(iso)), today()) : null)

/* ── One date formatter for the back office ─────────────────────────────────────────────── */

export type DateStyle = 'short' | 'long' | 'relative' | 'weekday' | 'time'

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/** The Mountain-time day ("YYYY-MM-DD") of a date-only string, an ISO timestamp, a Date or epoch ms; '' if none. */
export function dayOf(v?: string | number | Date | null): string {
  if (v == null || v === '') return ''
  if (typeof v === 'string' && isDay(v)) return v
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? '' : ymd(d)
}

/**
 * Every date in the back office goes through here, so they all read the same way (Mountain time):
 * - 'short'    "Nov 9"; the year only when it isn't this year ("Nov 9, 2025"). The default.
 * - 'long'     "November 9, 2026"
 * - 'relative' "today", "yesterday", "tomorrow", "3 days ago", "in 2 days"; a week or more away falls back to short.
 * - 'weekday'  "Mon, Nov 9" (year added when it isn't this year)
 * - 'time'     "Nov 9, 2:30 p.m." for a timestamp; a date-only value shows as short.
 * Accepts "YYYY-MM-DD", an ISO timestamp, a Date or epoch ms. Empty or invalid input gives ''.
 */
export function fmtDate(v?: string | number | Date | null, style: DateStyle = 'short'): string {
  const day = dayOf(v)
  if (!day) return ''
  const thisYear = day.slice(0, 4) === today().slice(0, 4)
  const year: Intl.DateTimeFormatOptions = thisYear ? {} : { year: 'numeric' }
  switch (style) {
    case 'long':
      return fmtDay(day, { month: 'long', day: 'numeric', year: 'numeric' })
    case 'weekday':
      return fmtDay(day, { weekday: 'short', month: 'short', day: 'numeric', ...year })
    case 'relative': {
      const n = daysBetween(today(), day)
      return Math.abs(n) < 7 ? relDays(day) : fmtDay(day, { month: 'short', day: 'numeric', ...year })
    }
    case 'time': {
      if (typeof v === 'string' && isDay(v)) return fmtDay(day, { month: 'short', day: 'numeric', ...year })
      const d = v instanceof Date ? v : new Date(v as string | number)
      return d.toLocaleString('en-CA', { month: 'short', day: 'numeric', ...year, hour: 'numeric', minute: '2-digit', timeZone: TZ })
    }
    default:
      return fmtDay(day, { month: 'short', day: 'numeric', ...year })
  }
}

/** The relative date at the start of a line or cell: "Today", "Yesterday", "3 days ago", then "Nov 4". Use instead of "1d" / "2d". */
export function fmtAgo(v?: string | number | Date | null): string {
  const s = fmtDate(v, 'relative')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}
