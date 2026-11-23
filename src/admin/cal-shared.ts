/** What the calendar page and its API share. Safe for the browser. */

export type CalSource = 'google' | 'icloud' | 'project'

export type CalInfo = {
  /** "g:<google calendar id>", "i:<caldav href>", "projects", or "s:<name>" for sample calendars. */
  id: string
  name: string
  color: string
  source: CalSource
  /** Events can be added and changed here. */
  writable: boolean
  /** Which account it belongs to, for the list ("Google", "iCloud"). */
  account: string
}

export type CalEvent = {
  /** Unique across all calendars: `${calendarId}|${eventRef}` (plus the occurrence for repeats). */
  id: string
  calendarId: string
  title: string
  allDay: boolean
  /** All day: "YYYY-MM-DD", end exclusive. Timed: ISO moments. */
  start: string
  end: string
  location?: string
  notes?: string
  /** Part of a repeating series. */
  recurring?: boolean
  /** Can't be changed here (project dates, repeats on iCloud, calendars shared read-only). */
  readOnly?: boolean
  /** Why it can't be changed here, shown in the drawer. */
  readOnlyWhy?: string
  /** Project dates: the project page. */
  projectHref?: string
  projectTitle?: string
  /** Open in Google Calendar. */
  link?: string
  /** For If-Match on save. */
  etag?: string
  /**
   * Mountain wall times ("YYYY-MM-DDTHH:mm") for timed events the back office makes itself (project dates,
   * samples). The browser turns them into moments with its own time-zone data, which is newer than the
   * server's (Alberta's 2026 change reached browsers before Node's bundled copy).
   */
  wall?: { start: string; end: string }
}

export type CalFeed = {
  calendars: CalInfo[]
  events: CalEvent[]
  /** Per account: why it couldn't be read just now (shown as a note, the rest still shows). */
  problems: { source: CalSource; text: string }[]
  /** Where new events go unless another calendar is picked. */
  defaultCalendar?: string
  sample: boolean
  connected: { google: boolean; icloud: boolean }
}

/** What the drawer sends. Times are Mountain wall time; the server works out the moment. */
export type EventInput = {
  calendarId: string
  title: string
  allDay: boolean
  /** "YYYY-MM-DD" */
  startDay: string
  /** "YYYY-MM-DD"; for all day, the last day (inclusive). */
  endDay: string
  /** "HH:mm", timed only */
  startTime?: string
  endTime?: string
  location?: string
  notes?: string
  /** The same start and end as moments (ISO), worked out in the browser; preferred over the wall times. */
  startAt?: string
  endAt?: string
}

export const PROJECTS_CAL = 'projects'
