'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { addDay, CAL_TZ, dayDiff, dayOfWeek, localDay, localTime, zonedToUtc } from '../cal-core'
import { PROJECTS_CAL, type CalEvent, type CalFeed, type CalInfo, type EventInput } from '../cal-shared'
import { saveFailed, useConfirm, useNotify } from './confirm'

/**
 * The back office calendar: Josh's Google and iCloud calendars and the project dates, in Month, Week, Day
 * and Agenda views (Mountain time). Events open in a side drawer to change, move or delete; saves go back to
 * the calendar each event came from.
 */

type View = 'month' | 'week' | 'day' | 'agenda'
const VIEWS: { v: View; label: string }[] = [
  { v: 'month', label: 'Month' },
  { v: 'week', label: 'Week' },
  { v: 'day', label: 'Day' },
  { v: 'agenda', label: 'Agenda' },
]
const HIDDEN_KEY = 'bi-cal-hidden'
const HOUR_PX = 48
const AGENDA_DAYS = 30

/* ── Dates and times (always Mountain time) ── */

const startOfWeek = (day: string) => addDay(day, -dayOfWeek(day))
const startMs = (e: CalEvent) => (e.allDay ? zonedToUtc(e.start) : Date.parse(e.start))
const endMs = (e: CalEvent) => (e.allDay ? zonedToUtc(e.end) : Date.parse(e.end))
const firstDay = (e: CalEvent) => (e.allDay ? e.start : localDay(startMs(e)))
const lastDay = (e: CalEvent) => (e.allDay ? addDay(e.end, -1) : localDay(Math.max(startMs(e), endMs(e) - 1)))
const covers = (e: CalEvent, day: string) => firstDay(e) <= day && lastDay(e) >= day

const dayLabel = (day: string, o: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-CA', { ...o, timeZone: 'UTC' })
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: CAL_TZ })
const fmtShortTime = (ms: number) => fmtTime(ms).replace(':00', '').replace(/\s?([ap])\.m\./, '$1')

function rangeOf(view: View, anchor: string): [string, string] {
  if (view === 'day') return [anchor, addDay(anchor, 1)]
  if (view === 'week') {
    const s = startOfWeek(anchor)
    return [s, addDay(s, 7)]
  }
  if (view === 'agenda') return [anchor, addDay(anchor, AGENDA_DAYS)]
  const s = startOfWeek(`${anchor.slice(0, 7)}-01`)
  return [s, addDay(s, 42)]
}

function titleOf(view: View, anchor: string) {
  if (view === 'month') return dayLabel(anchor, { month: 'long', year: 'numeric' })
  if (view === 'day') return dayLabel(anchor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const [a, b0] = rangeOf(view, anchor)
  const b = addDay(b0, -1)
  const sameMonth = a.slice(0, 7) === b.slice(0, 7)
  return `${dayLabel(a, { month: 'short', day: 'numeric' })} – ${sameMonth ? Number(b.slice(8)) : dayLabel(b, { month: 'short', day: 'numeric' })}, ${b.slice(0, 4)}`
}

function step(view: View, anchor: string, dir: 1 | -1) {
  if (view === 'day') return addDay(anchor, dir)
  if (view === 'week') return addDay(anchor, 7 * dir)
  if (view === 'agenda') return addDay(anchor, AGENDA_DAYS * dir)
  const [y, m] = anchor.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + dir, 1))
  return d.toISOString().slice(0, 10)
}

const unit = (view: View) => (view === 'agenda' ? `${AGENDA_DAYS} days` : view)

/** "All day", "9 – 10:30 a.m.", "Nov 23 – 26", for the grid and the drawer. */
function whenText(e: CalEvent, withDay = false) {
  const a = firstDay(e)
  const b = lastDay(e)
  if (e.allDay) {
    if (a === b) return withDay ? `${dayLabel(a, { weekday: 'short', month: 'short', day: 'numeric' })}, all day` : 'All day'
    return `${dayLabel(a, { month: 'short', day: 'numeric' })} – ${dayLabel(b, { month: 'short', day: 'numeric' })}, all day`
  }
  const s = startMs(e)
  const t = endMs(e)
  if (a === b) return `${withDay ? `${dayLabel(a, { weekday: 'short', month: 'short', day: 'numeric' })}, ` : ''}${fmtTime(s)} – ${fmtTime(t)}`
  return `${dayLabel(a, { month: 'short', day: 'numeric' })}, ${fmtTime(s)} – ${dayLabel(b, { month: 'short', day: 'numeric' })}, ${fmtTime(t)}`
}

/** Wall-time events (project dates, samples) get their moments from this browser's time-zone data. */
const wallIso = (w: string) => new Date(zonedToUtc(w.slice(0, 10), w.slice(11, 16))).toISOString()
const normalize = (e: CalEvent): CalEvent => (e.wall && !e.allDay ? { ...e, start: wallIso(e.wall.start), end: wallIso(e.wall.end) } : e)

/* ── Remembered list of hidden calendars ── */

function readHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
function writeHidden(ids: string[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids))
  } catch {
    /* private window: the choice lasts until the page closes */
  }
}

/* ── The page ── */

type Draft = EventInput
type Drawer = { kind: 'new'; draft: Draft } | { kind: 'edit'; event: CalEvent; draft: Draft } | { kind: 'view'; event: CalEvent }

export function CalendarApp({ today: serverToday, canEdit }: { today: string; canEdit: boolean }) {
  const [view, setView] = useState<View | null>(null)
  const [today, setToday] = useState(serverToday)
  const [anchor, setAnchor] = useState(serverToday)
  const [feed, setFeed] = useState<CalFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [hidden, setHidden] = useState<string[]>([])
  const [drawer, setDrawer] = useState<Drawer | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const req = useRef(0)
  const cache = useRef(new Map<string, CalFeed>())
  const notify = useNotify()

  // First paint: the view from the address, else Agenda on a phone and Week on a wider screen.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const v = q.get('view') as View | null
    const d = q.get('date')
    setView(v && VIEWS.some((x) => x.v === v) ? v : window.matchMedia('(max-width: 700px)').matches ? 'agenda' : 'week')
    // "Today" by this browser's clock and time-zone data.
    const t0 = localDay(Date.now())
    setToday(t0)
    setAnchor(d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : t0)
    setHidden(readHidden())
    const t = setInterval(() => {
      setNow(Date.now())
      setToday(localDay(Date.now()))
    }, 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!view) return
    const q = new URLSearchParams(window.location.search)
    q.set('view', view)
    if (anchor === today) q.delete('date')
    else q.set('date', anchor)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${q}`)
  }, [view, anchor, today])

  const range = useMemo(() => (view ? rangeOf(view, anchor) : null), [view, anchor])

  const load = useCallback(async (fresh = false) => {
    if (!range) return
    const key = range.join('|')
    const n = ++req.current
    const hit = cache.current.get(key)
    if (hit && !fresh) {
      setFeed(hit)
      setLoading(false)
      setFailed(false)
      return
    }
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from: range[0], to: range[1], start: new Date(zonedToUtc(range[0])).toISOString(), end: new Date(zonedToUtc(range[1])).toISOString() })
      const res = await fetch(`/api/admin/calendar?${qs}`, { cache: 'no-store' })
      const j = (await res.json()) as CalFeed & { ok: boolean }
      if (n !== req.current) return
      if (!res.ok || !j.ok) throw new Error(String(res.status))
      j.events = j.events.map(normalize)
      if (fresh) cache.current.clear()
      cache.current.set(key, j)
      setFeed(j)
      setFailed(false)
    } catch {
      if (n === req.current) setFailed(true)
    } finally {
      if (n === req.current) setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void load()
  }, [load])

  const calendars = feed?.calendars ?? []
  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])
  const shown = useMemo(
    () => (feed?.events ?? []).filter((e) => !hidden.includes(e.calendarId)).sort((a, b) => startMs(a) - startMs(b) || Number(b.allDay) - Number(a.allDay)),
    [feed, hidden],
  )
  const writable = calendars.filter((c) => c.writable)

  const toggle = (id: string) => {
    setHidden((h) => {
      const next = h.includes(id) ? h.filter((x) => x !== id) : [...h, id]
      writeHidden(next)
      return next
    })
  }

  const newDraft = (day: string, hour?: number): Draft => {
    const h = hour ?? (day === today ? Math.min(22, Number(localTime(Date.now()).slice(0, 2)) + 1) : 9)
    const pad = (x: number) => String(x).padStart(2, '0')
    return {
      calendarId: feed?.defaultCalendar && calById.get(feed.defaultCalendar)?.writable ? feed.defaultCalendar : (writable[0]?.id ?? ''),
      title: '',
      allDay: false,
      startDay: day,
      endDay: day,
      startTime: `${pad(h)}:00`,
      endTime: `${pad(Math.min(23, h + 1))}:${h >= 23 ? '59' : '00'}`,
      location: '',
      notes: '',
    }
  }

  const openEvent = (e: CalEvent) => {
    if (e.readOnly || !canEdit) return setDrawer({ kind: 'view', event: e })
    const s = startMs(e)
    const t = endMs(e)
    setDrawer({
      kind: 'edit',
      event: e,
      draft: {
        calendarId: e.calendarId,
        title: e.title === '(No title)' ? '' : e.title,
        allDay: e.allDay,
        startDay: firstDay(e),
        endDay: lastDay(e),
        startTime: e.allDay ? '09:00' : localTime(s),
        endTime: e.allDay ? '10:00' : localTime(t),
        location: e.location ?? '',
        notes: e.notes ?? '',
      },
    })
  }
  const openNew = (day: string, hour?: number) => {
    if (!canEdit || !writable.length) return
    setDrawer({ kind: 'new', draft: newDraft(day, hour) })
  }

  const afterSave = async (text: string, sample?: boolean) => {
    setDrawer(null)
    notify(sample ? 'Sample data: not saved.' : text)
    await load(true)
  }

  const goTo = (v: View, day?: string) => {
    setView(v)
    if (day) setAnchor(day)
  }

  const nothingConnected = feed && !feed.sample && !feed.connected.google && !feed.connected.icloud
  const hiddenCount = calendars.filter((c) => hidden.includes(c.id)).length
  const canAdd = canEdit && writable.length > 0

  const list = (
    <CalendarList calendars={calendars} hidden={hidden} onToggle={toggle} problems={feed?.problems ?? []} />
  )

  return (
    <div className="a-page cal">
      <header className="a-head cal-head">
        <h1 className="a-h1 sa-h1">Calendar</h1>
        {canEdit && (!feed || writable.length > 0) && (
          <button type="button" className="btn sa-copper" disabled={!canAdd} onClick={() => openNew(view === 'day' || !range ? anchor : today >= range[0] && today < range[1] ? today : range[0])}>
            New event
          </button>
        )}
      </header>

      {nothingConnected && (
        <p className="notice cal-connect">
          Only project dates show for now. <Link className="text-link" href="/admin/settings">Connect Google or iCloud in Settings</Link> to see and change your own calendars here.
        </p>
      )}

      <div className="cal-bar">
        <div className="cal-nav">
          <button type="button" className="btn btn-secondary cal-today" onClick={() => setAnchor(today)} disabled={!view}>Today</button>
          <button type="button" className="btn btn-secondary cal-arrow" onClick={() => view && setAnchor(step(view, anchor, -1))} disabled={!view} aria-label={view ? `Previous ${unit(view)}` : 'Previous'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button type="button" className="btn btn-secondary cal-arrow" onClick={() => view && setAnchor(step(view, anchor, 1))} disabled={!view} aria-label={view ? `Next ${unit(view)}` : 'Next'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
          <h2 className="cal-title" aria-live="polite">{view ? (view === 'agenda' ? `From ${dayLabel(anchor, { month: 'short', day: 'numeric', year: 'numeric' })}` : titleOf(view, anchor)) : ' '}</h2>
          {loading && <span className="cal-loading" role="status"><span className="sr-only">Loading events</span></span>}
        </div>
        <div className="a-switch cal-views" role="group" aria-label="View">
          {VIEWS.map((x) => (
            <button key={x.v} type="button" aria-pressed={view === x.v} onClick={() => setView(x.v)}>{x.label}</button>
          ))}
        </div>
      </div>

      <div className="cal-body">
        <aside className="cal-side" aria-label="Calendars">
          <div className="cal-side-wide">{list}</div>
          <details className="cal-side-fold">
            <summary>Calendars{hiddenCount ? ` (${hiddenCount} hidden)` : ''}</summary>
            {list}
          </details>
        </aside>

        <section className="cal-main" aria-label={view ? `${VIEWS.find((x) => x.v === view)?.label} view` : 'Calendar'} aria-busy={loading || undefined}>
          {failed && (
            <p className="err cal-failed" role="alert">
              The calendar didn’t load. <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load(true)}>Try again</button>
            </p>
          )}
          {!view || !range ? (
            <div className="cal-skeleton" aria-hidden="true" />
          ) : view === 'month' ? (
            <MonthView range={range} anchor={anchor} today={today} events={shown} cals={calById} onOpen={openEvent} onDay={(d) => goTo('day', d)} onNew={canAdd ? openNew : undefined} />
          ) : view === 'agenda' ? (
            <AgendaView range={range} today={today} events={shown} cals={calById} onOpen={openEvent} loading={loading} />
          ) : (
            <TimeGrid days={view === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDay(range[0], i))} today={today} now={now} events={shown} cals={calById} onOpen={openEvent} onDay={(d) => goTo('day', d)} onNew={canAdd ? openNew : undefined} />
          )}
        </section>
      </div>

      {drawer && (
        <EventDrawer
          key={drawer.kind === 'new' ? 'new' : drawer.event.id}
          drawer={drawer}
          cals={calById}
          writable={writable}
          onClose={() => setDrawer(null)}
          onSaved={afterSave}
        />
      )}
    </div>
  )
}

/* ── Calendar list: show and hide each calendar ── */

function CalendarList({ calendars, hidden, onToggle, problems }: { calendars: CalInfo[]; hidden: string[]; onToggle: (id: string) => void; problems: CalFeed['problems'] }) {
  const groups = ['Google', 'iCloud', 'Back office']
  return (
    <div className="cal-list">
      {groups.map((acct) => {
        const list = calendars.filter((c) => c.account === acct)
        const problem = problems.find((p) => (acct === 'Google' ? p.source === 'google' : acct === 'iCloud' ? p.source === 'icloud' : p.source === 'project'))
        if (!list.length && !problem) return null
        return (
          <fieldset key={acct} className="cal-list-group">
            <legend className="cal-list-label">{acct}</legend>
            {list.map((c) => (
              <label key={c.id} className="cal-check" style={{ '--cal': c.color } as React.CSSProperties}>
                <input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => onToggle(c.id)} />
                <span className="cal-swatch" aria-hidden="true" />
                <span className="cal-check-name">{c.name}</span>
                {!c.writable && c.source !== 'project' && <span className="sr-only"> (read only)</span>}
              </label>
            ))}
            {problem && <p className="cal-problem small">{problem.text}</p>}
          </fieldset>
        )
      })}
    </div>
  )
}

/* ── One event, as a button that opens it ── */

function EventButton({ e, cal, onOpen, compact, className = '', style, children }: { e: CalEvent; cal?: CalInfo; onOpen: (e: CalEvent) => void; compact?: boolean; className?: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  const name = `${whenText(e, true)}, ${e.title}, ${cal?.name ?? 'calendar'}${e.readOnly ? ', view only' : ''}`
  return (
    <button
      type="button"
      className={`cal-ev${e.allDay ? ' is-allday' : ''}${compact ? ' is-compact' : ''}${e.calendarId === PROJECTS_CAL ? ' is-project' : ''} ${className}`}
      style={{ '--cal': cal?.color ?? '#888', ...style } as React.CSSProperties}
      aria-label={name}
      title={`${e.title} · ${whenText(e)}`}
      onClick={() => onOpen(e)}
    >
      {children ?? <span className="cal-ev-title">{e.title}</span>}
    </button>
  )
}

/* ── Month ── */

function MonthView({ range, anchor, today, events, cals, onOpen, onDay, onNew }: { range: [string, string]; anchor: string; today: string; events: CalEvent[]; cals: Map<string, CalInfo>; onOpen: (e: CalEvent) => void; onDay: (d: string) => void; onNew?: (d: string) => void }) {
  const days = Array.from({ length: dayDiff(range[0], range[1]) }, (_, i) => addDay(range[0], i))
  const month = anchor.slice(0, 7)
  const MAX = 3
  return (
    <div className="cal-month">
      <div className="cal-month-head" aria-hidden="true">
        {days.slice(0, 7).map((d) => <span key={d}>{dayLabel(d, { weekday: 'short' })}</span>)}
      </div>
      <ul className="cal-month-grid" aria-label="Days">
        {days.map((d) => {
          const list = events.filter((e) => covers(e, d))
          const label = `${dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })}${d === today ? ' (today)' : ''}: ${list.length ? `${list.length} ${list.length === 1 ? 'event' : 'events'}` : 'nothing'}`
          return (
            <li key={d} className={`cal-mday${d.slice(0, 7) !== month ? ' is-out' : ''}${d === today ? ' is-today' : ''}`} onDoubleClick={(ev) => { if (onNew && ev.target === ev.currentTarget) onNew(d) }}>
              {/* Phones: the whole day is one button that opens it. */}
              <button type="button" className="cal-mday-phone" aria-label={label} onClick={() => onDay(d)}>
                <span className="cal-mday-num">{Number(d.slice(8))}</span>
                <span className="cal-dots" aria-hidden="true">
                  {list.slice(0, 4).map((e) => <span key={e.id} style={{ '--cal': cals.get(e.calendarId)?.color } as React.CSSProperties} />)}
                </span>
              </button>
              <button type="button" className="cal-mday-num cal-mday-link" aria-label={label} onClick={() => onDay(d)}>{Number(d.slice(8))}</button>
              <div className="cal-mday-evs">
                {list.slice(0, list.length > MAX ? MAX - 1 : MAX).map((e) => (
                  <EventButton key={e.id} e={e} cal={cals.get(e.calendarId)} onOpen={onOpen} compact>
                    {!e.allDay && <span className="cal-ev-time">{fmtShortTime(startMs(e))}</span>}
                    <span className="cal-ev-title">{e.title}</span>
                  </EventButton>
                ))}
                {list.length > MAX && (
                  <button type="button" className="cal-more" onClick={() => onDay(d)}>
                    {list.length - (MAX - 1)} more<span className="sr-only"> on {dayLabel(d, { month: 'long', day: 'numeric' })}</span>
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ── Week and Day: a time grid ── */

type Seg = { e: CalEvent; top: number; height: number; col: number; cols: number }

/** Timed events on one day, placed side by side where they overlap. */
function layoutDay(day: string, events: CalEvent[]): Seg[] {
  const d0 = zonedToUtc(day)
  const d1 = zonedToUtc(addDay(day, 1))
  const segs = events
    .filter((e) => !e.allDay && startMs(e) < d1 && Math.max(endMs(e), startMs(e) + 1) > d0)
    .map((e) => {
      const a = Math.max(startMs(e), d0)
      const b = Math.min(Math.max(endMs(e), a + 15 * 60_000), d1)
      return { e, a, b }
    })
    .sort((x, y) => x.a - y.a || y.b - x.b)
  const out: Seg[] = []
  let cluster: { e: CalEvent; a: number; b: number; col: number }[] = []
  let clusterEnd = 0
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1))
    for (const c of cluster) out.push({ e: c.e, top: ((c.a - d0) / 3_600_000) * HOUR_PX, height: Math.max(22, ((c.b - c.a) / 3_600_000) * HOUR_PX - 2), col: c.col, cols })
    cluster = []
  }
  for (const s of segs) {
    if (cluster.length && s.a >= clusterEnd) flush()
    const used = new Set(cluster.filter((c) => c.b > s.a).map((c) => c.col))
    let col = 0
    while (used.has(col)) col++
    cluster.push({ ...s, col })
    clusterEnd = Math.max(clusterEnd, s.b)
  }
  if (cluster.length) flush()
  return out
}

function TimeGrid({ days, today, now, events, cals, onOpen, onDay, onNew }: { days: string[]; today: string; now: number; events: CalEvent[]; cals: Map<string, CalInfo>; onOpen: (e: CalEvent) => void; onDay: (d: string) => void; onNew?: (d: string, hour?: number) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const single = days.length === 1
  useEffect(() => {
    // Open on the working day, not midnight.
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX
  }, [])
  // All-day events, and timed ones a day or longer, sit in the row above the hours.
  const allDay = days.map((d) => events.filter((e) => (e.allDay || endMs(e) - startMs(e) >= 86_400_000) && covers(e, d)))
  const longIds = new Set(allDay.flat().map((e) => e.id))
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const nowTop = ((now - zonedToUtc(today)) / 3_600_000) * HOUR_PX
  return (
    <div className={`cal-grid${single ? ' is-day' : ''}`} style={{ '--days': days.length } as React.CSSProperties}>
      <div className="cal-grid-head">
        <span className="cal-gutter" aria-hidden="true" />
        {days.map((d) => (
          <div key={d} className={`cal-col-head${d === today ? ' is-today' : ''}`}>
            {single ? (
              <span className="cal-col-day">
                <span className="cal-col-wd">{dayLabel(d, { weekday: 'short' })}</span>
                <span className="cal-col-num">{Number(d.slice(8))}</span>
              </span>
            ) : (
              <button type="button" className="cal-col-day" onClick={() => onDay(d)} aria-label={`${dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })}${d === today ? ' (today)' : ''}: open the day`}>
                <span className="cal-col-wd" aria-hidden="true">{dayLabel(d, { weekday: 'short' })}</span>
                <span className="cal-col-num" aria-hidden="true">{Number(d.slice(8))}</span>
              </button>
            )}
          </div>
        ))}
      </div>
      {allDay.some((l) => l.length) && (
        <div className="cal-allday">
          <span className="cal-gutter cal-allday-label">All day</span>
          {allDay.map((list, i) => (
            <div key={days[i]} className="cal-allday-col">
              {list.map((e) => <EventButton key={e.id} e={e} cal={cals.get(e.calendarId)} onOpen={onOpen} compact />)}
            </div>
          ))}
        </div>
      )}
      <div className="cal-scroll" ref={scroller}>
        <div className="cal-hours" style={{ height: 24 * HOUR_PX }}>
          <div className="cal-gutter cal-hour-labels" aria-hidden="true">
            {hours.map((h) => (
              <span key={h} style={{ top: h * HOUR_PX }}>{h === 0 ? '' : fmtShortTime(zonedToUtc(today, `${String(h).padStart(2, '0')}:00`))}</span>
            ))}
          </div>
          {days.map((d) => {
            const segs = layoutDay(d, events.filter((e) => !longIds.has(e.id)))
            return (
              <div
                key={d}
                className={`cal-day-col${d === today ? ' is-today' : ''}`}
                onClick={(ev) => {
                  if (!onNew || ev.target !== ev.currentTarget) return
                  const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top
                  onNew(d, Math.max(0, Math.min(23, Math.floor(y / HOUR_PX))))
                }}
              >
                {segs.map((s) => (
                  <EventButton
                    key={s.e.id}
                    e={s.e}
                    cal={cals.get(s.e.calendarId)}
                    onOpen={onOpen}
                    className="is-timed"
                    style={{ top: s.top, height: s.height, left: `calc(${(s.col / s.cols) * 100}% + 2px)`, width: `calc(${100 / s.cols}% - 4px)` }}
                  >
                    <span className="cal-ev-title">{s.e.title}</span>
                    {s.height >= 40 && <span className="cal-ev-time">{fmtShortTime(startMs(s.e))} – {fmtShortTime(endMs(s.e))}</span>}
                  </EventButton>
                ))}
                {d === today && nowTop >= 0 && nowTop <= 24 * HOUR_PX && <span className="cal-now" style={{ top: nowTop }} aria-hidden="true" />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Agenda: the next 30 days as a list ── */

function AgendaView({ range, today, events, cals, onOpen, loading }: { range: [string, string]; today: string; events: CalEvent[]; cals: Map<string, CalInfo>; onOpen: (e: CalEvent) => void; loading: boolean }) {
  const days = Array.from({ length: dayDiff(range[0], range[1]) }, (_, i) => addDay(range[0], i))
  const withEvents = days.map((d) => ({ d, list: events.filter((e) => covers(e, d)) })).filter((x) => x.list.length || x.d === today)
  if (!loading && !withEvents.some((x) => x.list.length)) return <p className="cal-empty">Nothing in these {AGENDA_DAYS} days.</p>
  return (
    <ol className="cal-agenda">
      {withEvents.map(({ d, list }) => (
        <li key={d} className={`cal-aday${d === today ? ' is-today' : ''}`}>
          <h3 className="cal-aday-head">
            <span className="cal-aday-num" aria-hidden="true">{Number(d.slice(8))}</span>
            <span>{d === today ? 'Today, ' : ''}{dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </h3>
          {list.length ? (
            <ul className="cal-alist">
              {list.map((e) => {
                const cal = cals.get(e.calendarId)
                return (
                  <li key={e.id}>
                    <EventButton e={e} cal={cal} onOpen={onOpen} className="cal-arow">
                      <span className="cal-arow-time">{e.allDay || firstDay(e) !== lastDay(e) ? (e.allDay && firstDay(e) === lastDay(e) ? 'All day' : whenText(e)) : `${fmtShortTime(startMs(e))} – ${fmtShortTime(endMs(e))}`}</span>
                      <span className="cal-swatch" aria-hidden="true" />
                      <span className="cal-arow-main">
                        <span className="cal-ev-title">{e.title}</span>
                        <span className="cal-arow-sub">{[cal?.name, e.location].filter(Boolean).join(' · ')}</span>
                      </span>
                    </EventButton>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="cal-aday-empty small">Nothing booked.</p>
          )}
        </li>
      ))}
    </ol>
  )
}

/* ── The drawer: look at, add, change, move or delete one event ── */

function EventDrawer({ drawer, cals, writable, onClose, onSaved }: { drawer: Drawer; cals: Map<string, CalInfo>; writable: CalInfo[]; onClose: () => void; onSaved: (text: string, sample?: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const opener = useRef<Element | null>(null)
  const id = useId()
  const confirm = useConfirm()
  const [draft, setDraft] = useState<Draft | null>(drawer.kind === 'view' ? null : drawer.draft)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    opener.current = document.activeElement
    ref.current?.showModal()
    // showModal() focuses the first button (Close); a new event starts in its title instead.
    if (drawer.kind === 'new') titleRef.current?.focus()
    return () => {
      const el = opener.current
      if (el instanceof HTMLElement && el.isConnected) requestAnimationFrame(() => el.focus({ preventScroll: true }))
    }
  }, [])

  const event = drawer.kind === 'new' ? null : drawer.event
  const cal = event ? cals.get(event.calendarId) : draft ? cals.get(draft.calendarId) : undefined

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => {
      if (!d) return d
      const next = { ...d, [k]: v }
      // Moving the start keeps the length.
      if (k === 'startDay' && typeof v === 'string' && v) next.endDay = addDay(v, Math.max(0, dayDiff(d.startDay, d.endDay)))
      if (k === 'startTime' && typeof v === 'string' && v && d.startTime && d.endTime && d.startDay === d.endDay) {
        const len = zonedToUtc(d.endDay, d.endTime) - zonedToUtc(d.startDay, d.startTime)
        const end = zonedToUtc(next.startDay, v) + Math.max(15 * 60_000, len)
        next.endDay = localDay(end)
        next.endTime = localTime(end)
      }
      return next
    })

  async function send(method: 'POST' | 'PATCH' | 'DELETE', body: unknown) {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/calendar', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; sample?: boolean }
      if (!res.ok || !j.ok) {
        setMsg(j.message ?? saveFailed(res.status))
        return null
      }
      return j
    } catch {
      setMsg(saveFailed())
      return null
    } finally {
      setBusy(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    if (!draft.title.trim()) return setMsg('Give the event a title.')
    const timed = !draft.allDay && draft.startTime && draft.endTime
    const input: EventInput = {
      ...draft,
      startTime: timed ? draft.startTime : undefined,
      endTime: timed ? draft.endTime : undefined,
      // Worked out here: this browser's time-zone data is newer than the server's.
      startAt: timed ? new Date(zonedToUtc(draft.startDay, draft.startTime)).toISOString() : undefined,
      endAt: timed ? new Date(zonedToUtc(draft.endDay, draft.endTime)).toISOString() : undefined,
    }
    const to = cals.get(draft.calendarId)?.name ?? 'the calendar'
    if (drawer.kind === 'new') {
      const r = await send('POST', { event: input })
      if (r) onSaved(`Added to ${to}.`, r.sample)
    } else if (drawer.kind === 'edit') {
      const r = await send('PATCH', { id: drawer.event.id, event: input, etag: drawer.event.etag })
      if (r) onSaved(draft.calendarId !== drawer.event.calendarId ? `Moved to ${to}.` : `Saved to ${to}.`, r.sample)
    }
  }

  async function remove() {
    if (drawer.kind !== 'edit') return
    const ok = await confirm({
      title: 'Delete this event?',
      body: `“${drawer.event.title}” will be deleted from ${cal?.name ?? 'its calendar'}${cal?.account === 'iCloud' ? ' in iCloud' : cal?.account === 'Google' ? ' in Google Calendar' : ''}, on every device.${drawer.event.recurring ? ' Only this occurrence is deleted.' : ''}`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const r = await send('DELETE', { id: drawer.event.id, etag: drawer.event.etag })
    if (r) onSaved('Deleted.', r.sample)
  }

  const heading = drawer.kind === 'new' ? 'New event' : drawer.kind === 'edit' ? 'Edit event' : (event?.title ?? 'Event')
  const groups = ['Google', 'iCloud'].map((acct) => ({ acct, list: writable.filter((c) => c.account === acct) })).filter((g) => g.list.length)

  return (
    <dialog
      ref={ref}
      className="a-dialog cal-drawer"
      aria-labelledby={`${id}-h`}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}
    >
      <div className="cal-drawer-body" style={{ '--cal': cal?.color ?? '#888' } as React.CSSProperties}>
        <div className="cal-drawer-top">
          <h2 id={`${id}-h`} className="a-h2 a-h2-lg">{heading}</h2>
          <button type="button" className="cal-x" onClick={() => ref.current?.close()} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {drawer.kind === 'view' && event ? (
          <div className="cal-view">
            <p className="cal-view-when">{whenText(event, true)}</p>
            <p className="cal-view-cal"><span className="cal-swatch" aria-hidden="true" />{cal?.name}{cal && cal.source !== 'project' ? <span className="sa-muted"> · {cal.account}</span> : null}</p>
            {event.location && <p className="m0"><span className="sa-muted">Where:</span> {event.location}</p>}
            {event.notes && <p className="cal-view-notes">{event.notes}</p>}
            {event.readOnlyWhy && <p className="cal-why small">{event.readOnlyWhy}</p>}
            <div className="btn-row">
              {event.projectHref && <Link className="btn sa-copper" href={event.projectHref}>Open {event.projectTitle ? `“${event.projectTitle}”` : 'the project'}</Link>}
              {event.link && <a className="btn btn-secondary" href={event.link} target="_blank" rel="noopener noreferrer">Open in Google Calendar<span className="sr-only"> (new tab)</span></a>}
              <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()}>Close</button>
            </div>
          </div>
        ) : draft ? (
          <form className="cal-form" onSubmit={save} noValidate>
            <div className="field">
              <label htmlFor={`${id}-t`}>Title</label>
              <input ref={titleRef} id={`${id}-t`} className="input" value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={300} required autoComplete="off" />
            </div>
            <label className="a-check">
              <input type="checkbox" checked={draft.allDay} onChange={(e) => set('allDay', e.target.checked)} />
              <span>All day</span>
            </label>
            <fieldset className="cal-when">
              <legend className="sr-only">Starts</legend>
              <div className="field">
                <label htmlFor={`${id}-sd`}>Starts</label>
                <input id={`${id}-sd`} type="date" className="input" value={draft.startDay} onChange={(e) => set('startDay', e.target.value)} required />
              </div>
              {!draft.allDay && (
                <div className="field">
                  <label htmlFor={`${id}-st`}>Start time</label>
                  <input id={`${id}-st`} type="time" step={300} className="input" value={draft.startTime ?? ''} onChange={(e) => set('startTime', e.target.value)} required />
                </div>
              )}
            </fieldset>
            <fieldset className="cal-when">
              <legend className="sr-only">Ends</legend>
              <div className="field">
                <label htmlFor={`${id}-ed`}>Ends</label>
                <input id={`${id}-ed`} type="date" className="input" value={draft.endDay} min={draft.startDay} onChange={(e) => set('endDay', e.target.value)} required />
              </div>
              {!draft.allDay && (
                <div className="field">
                  <label htmlFor={`${id}-et`}>End time</label>
                  <input id={`${id}-et`} type="time" step={300} className="input" value={draft.endTime ?? ''} onChange={(e) => set('endTime', e.target.value)} required />
                </div>
              )}
            </fieldset>
            <p className="small sa-muted m0">Mountain time (Edmonton, Yellowknife).</p>
            <div className="field">
              <label htmlFor={`${id}-c`}>Calendar</label>
              <select id={`${id}-c`} className="input" value={draft.calendarId} onChange={(e) => set('calendarId', e.target.value)}>
                {groups.map((g) => (
                  <optgroup key={g.acct} label={g.acct}>
                    {g.list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
              {drawer.kind === 'edit' && draft.calendarId !== drawer.event.calendarId && (
                <span className="hint">The event moves to this calendar when you save.</span>
              )}
            </div>
            <div className="field">
              <label htmlFor={`${id}-l`}>Location <span className="muted">(optional)</span></label>
              <input id={`${id}-l`} className="input" value={draft.location ?? ''} onChange={(e) => set('location', e.target.value)} maxLength={500} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor={`${id}-n`}>Notes <span className="muted">(optional)</span></label>
              <textarea id={`${id}-n`} className="input cal-notes" rows={4} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} maxLength={8000} />
            </div>
            {drawer.kind === 'edit' && drawer.event.recurring && <p className="cal-why small">This is one occurrence of a repeating event. Changes apply to this one only.</p>}
            {msg && <p className="err m0" role="alert">{msg}</p>}
            <div className="btn-row cal-form-foot">
              <button type="submit" className="btn sa-copper" disabled={busy} aria-busy={busy || undefined}>{busy ? 'Saving…' : drawer.kind === 'new' ? 'Add event' : 'Save'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()}>Cancel</button>
              {drawer.kind === 'edit' && (
                <button type="button" className="btn btn-secondary cal-delete" onClick={() => void remove()} disabled={busy}>Delete</button>
              )}
            </div>
            {drawer.kind === 'edit' && drawer.event.link && (
              <a className="text-link small" href={drawer.event.link} target="_blank" rel="noopener noreferrer">Open in Google Calendar<span className="sr-only"> (new tab)</span></a>
            )}
          </form>
        ) : null}
      </div>
    </dialog>
  )
}
