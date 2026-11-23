import { NextResponse } from 'next/server'
import { adminFromRequest } from '@/admin/auth'
import { allCalendars, setDefaultCalendar } from '@/admin/calendar-feed'

export const runtime = 'nodejs'

/** Form post from Settings: the calendar new events go to unless another is picked. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings?${q}#calendars`, req.url), 303)
  if (!admin || admin.viewOnly) return back('error=view-only')
  const form = await req.formData().catch(() => null)
  const id = String(form?.get('calendar') ?? '')
  const { calendars } = await allCalendars()
  if (!calendars.some((c) => c.id === id && c.writable)) return back('error=calendar')
  await setDefaultCalendar(id)
  return back('saved=calendar')
}
