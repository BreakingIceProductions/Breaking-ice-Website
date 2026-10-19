import { adminFromRequest } from '@/admin/auth'
import { syncProjectCalendar } from '@/admin/calendar'
import { getProject } from '@/admin/data'
import { refreshInvoices } from '@/admin/sync'
import { xeroConnection } from '@/admin/xero'
import { json } from '@/portal/http'

export const runtime = 'nodejs'
export const maxDuration = 60

/** "Sync now" on a project: calendar and invoice statuses, without waiting for the scheduler. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)
  if (admin.sample) return json({ ok: true, message: 'Sample mode: nothing to sync.' })
  try {
    const cal = await syncProjectCalendar(p)
    if (await xeroConnection()) await refreshInvoices({ ...p, office: { ...p.office, invoices: (p.office.invoices ?? []).map((i) => ({ ...i, syncedAt: undefined })) } })
    return json({ ok: true, message: 'skipped' in cal ? 'Invoices checked. Calendar isn’t connected yet.' : `Calendar: ${cal.created} added, ${cal.updated} updated, ${cal.removed} removed.` })
  } catch (e) {
    return json({ ok: false, error: 'failed', message: String(e).slice(0, 200) }, 500)
  }
}
