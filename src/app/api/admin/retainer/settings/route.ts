import { adminFromRequest } from '@/admin/auth'
import { json } from '@/portal/http'
import { canWrite, getRetainerClient, saveRetainerSettings } from '@/retainer/data'

export const runtime = 'nodejs'

/** Saves a client's retainer settings from the back office. View-only sign-ins are refused (adminFromRequest). */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out', message: 'This sign-in can’t make changes, or it has expired.' }, 401)
  const b = await req.json().catch(() => ({}))
  const c = await getRetainerClient(String(b.clientId ?? ''), { includeInactive: true })
  if (!c) return json({ ok: false, error: 'not-found', message: 'That client isn’t there any more. Reload the page.' }, 404)
  const s = b.settings ?? {}
  if (s.accent && !/^#[0-9a-fA-F]{6}$/.test(String(s.accent))) return json({ ok: false, error: 'accent', message: 'The colour must look like #1f6feb.' }, 400)
  if (s.startMonth && s.endMonth && String(s.endMonth) < String(s.startMonth)) return json({ ok: false, error: 'months', message: 'The last month can’t be before the first.' }, 400)
  if (admin.sample || !canWrite(c._id)) return json({ ok: true, sample: true })
  try {
    return json({ ok: true, settings: await saveRetainerSettings(c._id, s) })
  } catch (e) {
    console.error('[retainer] settings save failed', e)
    return json({ ok: false, error: 'failed', message: 'That didn’t save. Try again.' }, 502)
  }
}
