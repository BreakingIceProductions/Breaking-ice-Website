import 'server-only'

/**
 * Granola's Personal API (beta), for "Draft from a call": recent meeting notes, and one note's
 * summary, Josh's own notes and transcript, read on the server only. Needs GRANOLA_API_KEY
 * (a personal key, "grn_…", from Granola → Settings → Connectors → API keys).
 * Docs: https://docs.granola.ai/api-reference — 5 requests a second, 25 at once.
 */

const BASE = 'https://public-api.granola.ai'
const key = () => process.env.GRANOLA_API_KEY?.trim() || ''
export const granolaReady = () => Boolean(key())

export class GranolaError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

type User = { name?: string | null; email?: string | null }
type NoteSummary = { id: string; title?: string | null; owner?: User; created_at: string; meeting_at?: string | null }
type TranscriptItem = { speaker?: { source?: string; attribution?: string; diarization_label?: string }; text?: string }
type Note = NoteSummary & {
  attendees?: User[]
  calendar_event?: { event_title?: string | null; invitees?: User[] | null; scheduled_start_time?: string | null } | null
  summary_text?: string | null
  summary_markdown?: string | null
  private_notes_markdown?: string | null
  private_notes_text?: string | null
  transcript?: TranscriptItem[] | null
}

async function call<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${key()}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  })
  if (res.ok) return (await res.json()) as T
  const err = (await res.json().catch(() => ({}))) as { code?: string }
  if (res.status === 401) throw new GranolaError(401, 'Granola refused the key. Check GRANOLA_API_KEY in Vercel.')
  if (res.status === 403) throw new GranolaError(403, err.code === 'FORBIDDEN' ? 'Granola won’t share this (transcript access may be switched off).' : 'Granola refused the request.')
  if (res.status === 404) throw new GranolaError(404, 'That note isn’t in Granola any more, or this key can’t read it.')
  if (res.status === 413) throw new GranolaError(413, 'TRANSCRIPT_TOO_LARGE')
  if (res.status === 429) throw new GranolaError(429, 'Granola is busy. Try again in a minute.')
  throw new GranolaError(502, 'Granola didn’t answer properly. Try again in a minute.')
}

export type CallNote = { id: string; title: string; at: string; match?: 'attendee' | 'title' }

/**
 * Notes from the last 60 days, ones with this person or company on the invite first (Granola's own
 * participant search), then ones whose title names them, then the rest, newest first.
 */
export async function listCallNotes(who: { emails: string[]; names: string[]; company?: string }): Promise<CallNote[]> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
  const participants = [...new Set([...who.emails.map((e) => e.toLowerCase()), who.company?.trim()].filter((x): x is string => Boolean(x)))].slice(0, 4)

  const listing = (async () => {
    const out: NoteSummary[] = []
    let cursor: string | null = null
    for (let page = 0; page < 4; page++) {
      const q = new URLSearchParams({ created_after: since, page_size: '30', ...(cursor ? { cursor } : {}) })
      const r: { notes: NoteSummary[]; hasMore: boolean; cursor: string | null } = await call(`/v1/notes?${q}`)
      out.push(...r.notes)
      if (!r.hasMore || !r.cursor) break
      cursor = r.cursor
    }
    return out
  })()
  const searches = participants.map((participant) =>
    call<{ notes: NoteSummary[] }>('/v1/notes/search', { method: 'POST', body: { participant, from_date: since, page_size: 30 } })
      .then((r) => r.notes)
      .catch(() => [] as NoteSummary[]),
  )
  const [all, ...found] = await Promise.all([listing, ...searches])

  const matched = new Map(found.flat().map((n) => [n.id, n]))
  const words = [...who.names.flatMap((n) => n.split(/\s+/)).filter((w) => w.length > 2), ...(who.company ? [who.company] : [])].map((w) => w.toLowerCase())
  const byId = new Map<string, NoteSummary>()
  for (const n of [...matched.values(), ...all]) if (!byId.has(n.id)) byId.set(n.id, n)
  const rows: CallNote[] = [...byId.values()].map((n) => {
    const title = n.title?.trim() || 'Untitled meeting'
    const named = words.some((w) => title.toLowerCase().includes(w))
    return { id: n.id, title, at: n.meeting_at || n.created_at, ...(matched.has(n.id) ? { match: 'attendee' as const } : named ? { match: 'title' as const } : {}) }
  })
  const rank = (r: CallNote) => (r.match === 'attendee' ? 0 : r.match === 'title' ? 1 : 2)
  return rows.sort((a, b) => rank(a) - rank(b) || b.at.localeCompare(a.at)).slice(0, 40)
}

const MAX_SOURCE = 150_000

const who = (s?: TranscriptItem['speaker']) =>
  s?.attribution === 'me' ? 'Josh' : s?.attribution === 'them' ? 'Them' : s?.diarization_label || (s?.source === 'microphone' ? 'Josh (mic)' : 'Them')

/** One note as plain text for the draft: title, date, who was there, the summary, Josh's notes, then the transcript. */
export async function callSource(noteId: string): Promise<{ title: string; text: string }> {
  if (!/^not_[A-Za-z0-9]{14}$/i.test(noteId)) throw new GranolaError(400, 'Pick a note from the list.')
  let note: Note
  let transcript: TranscriptItem[] = []
  try {
    note = await call<Note>(`/v1/notes/${noteId}?include=transcript`)
    transcript = note.transcript ?? []
  } catch (e) {
    if (!(e instanceof GranolaError) || e.status !== 413) throw e
    // Too big to come inline: read the note, then the transcript a page at a time (up to 20 pages).
    note = await call<Note>(`/v1/notes/${noteId}`)
    let cursor: string | null = null
    for (let page = 0; page < 20; page++) {
      const q = new URLSearchParams({ page_size: '100', ...(cursor ? { cursor } : {}) })
      const r: { transcript: TranscriptItem[]; hasMore: boolean; cursor: string | null } = await call(`/v1/notes/${noteId}/transcript?${q}`)
      transcript.push(...r.transcript)
      if (!r.hasMore || !r.cursor) break
      cursor = r.cursor
    }
  }
  const title = note.title?.trim() || note.calendar_event?.event_title?.trim() || 'Untitled meeting'
  const people = (note.attendees?.length ? note.attendees : (note.calendar_event?.invitees ?? [])).map((u) => [u.name, u.email && `<${u.email}>`].filter(Boolean).join(' ')).filter(Boolean)
  const summary = note.summary_markdown?.trim() || note.summary_text?.trim() || ''
  const mine = note.private_notes_markdown?.trim() || note.private_notes_text?.trim() || ''
  const lines = transcript.filter((t) => t.text?.trim()).map((t) => `${who(t.speaker)}: ${t.text!.trim()}`)
  const text = [
    `Meeting: ${title}`,
    `When: ${note.calendar_event?.scheduled_start_time || note.meeting_at || note.created_at}`,
    people.length ? `Attendees: ${people.join(', ')}` : '',
    summary ? `\nGranola's summary:\n${summary}` : '',
    mine ? `\nJosh's own notes:\n${mine}` : '',
    lines.length ? `\nTranscript ("Josh" is Josh; "Them" is the other side):\n${lines.join('\n')}` : '',
  ].filter(Boolean).join('\n')
  return { title, text: text.length > MAX_SOURCE ? `${text.slice(0, MAX_SOURCE)}\n[Transcript cut here: too long to send in full.]` : text }
}
