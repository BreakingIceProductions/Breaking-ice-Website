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
