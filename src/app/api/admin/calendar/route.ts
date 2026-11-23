import { z } from 'zod'
import { adminFromRequest } from '@/admin/auth'
import { isDay } from '@/admin/cal-core'
import { calendarFeed, CalendarInputError, createEvent, deleteEvent, GoogleConflict, IcloudConflict, updateEvent } from '@/admin/calendar-feed'
import { IcloudError } from '@/admin/caldav'
import { GoogleAuthError } from '@/admin/gcal'
import { adminSampleMode } from '@/admin/config'
import { json } from '@/portal/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The calendar page: read a range (GET), add (POST), change (PATCH) and delete (DELETE) events. */

export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const u = new URL(req.url)
  const from = u.searchParams.get('from')
  const to = u.searchParams.get('to')
  if (!isDay(from) || !isDay(to) || to <= from || Date.parse(to) - Date.parse(from) > 100 * 86_400_000) return json({ ok: false, error: 'range' }, 400)
  const a = Date.parse(u.searchParams.get('start') ?? '')
  const b = Date.parse(u.searchParams.get('end') ?? '')
  const exact = Number.isFinite(a) && Number.isFinite(b) && b > a && Math.abs(a - Date.parse(`${from}T07:00:00Z`)) < 86_400_000 ? { fromMs: a, toMs: b } : undefined
  return json({ ok: true, ...(await calendarFeed(from, to, exact)) })
}

const input = z.object({
  calendarId: z.string().min(1).max(600),
  title: z.string().max(300),
  allDay: z.boolean(),
  startDay: z.string().max(10),
  endDay: z.string().max(10),
  startTime: z.string().max(5).optional(),
  endTime: z.string().max(5).optional(),
  location: z.string().max(500).optional(),
  notes: z.string().max(8000).optional(),
  startAt: z.string().max(40).optional(),
  endAt: z.string().max(40).optional(),
})
const id = z.string().min(3).max(1200)
const etag = z.string().max(300).optional()

/** A refusal the person can act on, or a plain "didn't save" (details only in the server log). */
function failed(e: unknown) {
  if (e instanceof CalendarInputError) return json({ ok: false, message: e.message }, 400)
  if (e instanceof GoogleConflict || e instanceof IcloudConflict) return json({ ok: false, message: e.message, conflict: true }, 409)
  if (e instanceof GoogleAuthError || e instanceof IcloudError) return json({ ok: false, message: e.message }, 502)
  console.error('[calendar] save failed', e)
  return json({ ok: false, message: 'The calendar didn’t take that change. Try again.' }, 502)
}

async function write(req: Request, run: (body: unknown) => Promise<Record<string, unknown>>) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => null)
  try {
    return json({ ok: true, sample: adminSampleMode() || undefined, ...(await run(body)) })
  } catch (e) {
    if (e instanceof z.ZodError) return json({ ok: false, message: 'Something in the form isn’t right. Check it and try again.' }, 400)
    return failed(e)
  }
}

export const POST = (req: Request) => write(req, async (b) => ({ id: await createEvent(z.object({ event: input }).parse(b).event) }))

export const PATCH = (req: Request) =>
  write(req, async (b) => {
    const p = z.object({ id, event: input, etag }).parse(b)
    return { id: await updateEvent(p.id, p.event, p.etag) }
  })

export const DELETE = (req: Request) =>
  write(req, async (b) => {
    const p = z.object({ id, etag }).parse(b)
    await deleteEvent(p.id, p.etag)
    return {}
  })
