import { adminFromRequest } from '@/admin/auth'
import { driveReady, MAX_UPLOAD_BYTES } from '@/portal/config'
import { ensureClientSubfolder, startUploadToFolder } from '@/portal/drive'
import { json } from '@/portal/http'
import { canWrite, getRetainerClient, isMonthKey } from '@/retainer/data'

export const runtime = 'nodejs'

/**
 * Opens a resumable upload from the back office into the client's Drive folder Retainer/<YYYY-MM>
 * (created if needed). The browser then sends the file straight to Google (src/portal/uploader.tsx),
 * and attaches it to the item through /api/admin/retainer/item.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const b = await req.json().catch(() => ({}))
  const name = String(b.name ?? '').slice(0, 200)
  const size = Number(b.size)
  const month = String(b.month ?? '')
  if (!name || !Number.isFinite(size) || size <= 0 || !isMonthKey(month)) return json({ ok: false, error: 'invalid' }, 400)
  if (size > MAX_UPLOAD_BYTES) return json({ ok: false, error: 'too-big' }, 400)
  const c = await getRetainerClient(String(b.clientId ?? ''), { includeInactive: true })
  if (!c) return json({ ok: false }, 404)
  if (admin.sample || !canWrite(c._id)) return json({ ok: true, demo: true })
  if (!driveReady()) return json({ ok: false, error: 'not-configured' }, 503)
  const origin = req.headers.get('origin') || new URL(req.url).origin
  try {
    const folder = await ensureClientSubfolder(c, ['Retainer', month])
    const sessionUrl = await startUploadToFolder(folder, { name, size, type: String(b.type || '') }, origin, 'Breaking Ice')
    return json({ ok: true, sessionUrl })
  } catch (e) {
    console.error('[retainer] upload start failed', e)
    return json({ ok: false, error: 'drive' }, 502)
  }
}
