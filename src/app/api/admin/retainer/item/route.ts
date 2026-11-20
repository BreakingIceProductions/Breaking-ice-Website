import { adminFromRequest } from '@/admin/auth'
import { json } from '@/portal/http'
import { attachFiles, canWrite, getRetainerClient, isMonthKey, removeItem, upsertItem, validKey } from '@/retainer/data'

export const runtime = 'nodejs'

/**
 * A month's hand-made items, from the back office.
 * { clientId, month, action: 'upsert', item }   adds or replaces an item (by _key)
 * { clientId, month, action: 'remove', key }     removes one
 * { clientId, month, action: 'attach', key, files: [{id, name, size, mimeType}] }  after an upload to Retainer/<month>
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out', message: 'This sign-in can’t make changes, or it has expired.' }, 401)
  const b = await req.json().catch(() => ({}))
  const month = String(b.month ?? '')
  if (!isMonthKey(month)) return json({ ok: false, error: 'month', message: 'That month isn’t valid.' }, 400)
  const c = await getRetainerClient(String(b.clientId ?? ''), { includeInactive: true })
  if (!c) return json({ ok: false, error: 'not-found', message: 'That client isn’t there any more. Reload the page.' }, 404)
  const sample = admin.sample || !canWrite(c._id)
  try {
    if (b.action === 'upsert') {
      const item = b.item ?? {}
      if (!String(item.title ?? '').trim()) return json({ ok: false, error: 'title', message: 'Give it a title.' }, 400)
      // Files only change through 'attach', so an edit can't drop them.
      delete item.files
      const saved = await upsertItem(c._id, month, item)
      return json({ ok: true, item: saved, ...(sample ? { sample: true } : {}) })
    }
    if (!validKey(b.key)) return json({ ok: false, error: 'key' }, 400)
    if (b.action === 'remove') {
      await removeItem(c._id, month, b.key)
      return json({ ok: true, ...(sample ? { sample: true } : {}) })
    }
    if (b.action === 'attach') {
      const files = await attachFiles(c._id, month, b.key, Array.isArray(b.files) ? b.files : [])
      return json({ ok: true, files, ...(sample ? { sample: true } : {}) })
    }
    return json({ ok: false, error: 'action' }, 400)
  } catch (e) {
    console.error('[retainer] item write failed', e)
    return json({ ok: false, error: 'failed', message: 'That didn’t save. Try again.' }, 502)
  }
}
