import '../../../css/admin-simple-a.css'
import '../../../css/admin-calendar.css'
import { requireAdmin } from '@/admin/auth'
import { localDay } from '@/admin/cal-core'
import { CalendarApp } from '@/admin/ui/calendar'

export const metadata = { title: 'Calendar' }

/** Google and iCloud calendars plus project dates, in the back office (no trip out to calendar.google.com). */
export default async function CalendarPage() {
  const admin = await requireAdmin()
  return <CalendarApp today={localDay(Date.now())} canEdit={!admin.viewOnly} />
}
