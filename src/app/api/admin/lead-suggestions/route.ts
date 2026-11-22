import { timingSafeEqual } from 'node:crypto'
import { adminFromRequest } from '@/admin/auth'
import { acceptSuggestion, addSuggestion, cleanSuggestion, dismissSuggestion, listSuggestions, SuggestionError } from '@/admin/capture'
import { json } from '@/portal/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Suggested leads (src/admin/capture.ts).
 *
 *   GET                                   the list (signed-in admin)
 *   POST { action: 'add', name, summary, email?, company?, when?, ref?, title?, source? }
 *   POST { action: 'accept', key }        "Add as lead": makes the lead, answers { id, href }
 *   POST { action: 'dismiss', key }
 *
 * A signed-in admin can do all three (view-only sign-ins are refused). The email checker on Josh's Mac
 * can only add, with "Authorization: Bearer <LEAD_INBOX_SECRET>"; it's refused while that isn't set.
 * Nothing here contacts the lead.
 */

const secretOk = (req: Request) => {
  const secret = process.env.LEAD_INBOX_SECRET?.trim()
  const header = req.headers.get('authorization') ?? ''
  if (!secret || !header) return false
  const given = Buffer.from(header)
  const want = Buffer.from(`Bearer ${secret}`)
  return given.length === want.length && timingSafeEqual(given, want)
}

export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  return json({ ok: true, items: await listSuggestions() })
}

export async function POST(req: Request) {
  const bearer = (req.headers.get('authorization') ?? '').startsWith('Bearer ')
  if (bearer && !secretOk(req)) return json({ ok: false, error: 'unauthorized' }, 401)
  const admin = bearer ? null : await adminFromRequest(req)
  if (!bearer && (!admin || admin.viewOnly)) return json({ ok: false, error: 'signed-out', message: 'This sign-in can’t do that, or it has expired.' }, 401)

  const text = await req.text().catch(() => '')
  if (text.length > 20_000) return json({ ok: false, error: 'too-large' }, 413)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text || '{}')
  } catch {
    return json({ ok: false, error: 'invalid', message: 'That didn’t look right.' }, 400)
  }
  const action = body.action
  if (bearer && action !== 'add') return json({ ok: false, error: 'forbidden' }, 403)

  try {
    if (action === 'add') {
      // The email checker adds email suggestions (or manual ones); the admin adds manual ones.
      const source = bearer ? (body.source === 'manual' ? 'manual' : 'email') : 'manual'
      const s = cleanSuggestion(body, source)
      if (!s) return json({ ok: false, error: 'invalid', message: 'A suggestion needs a name and a summary, and the email has to look right.' }, 400)
      if (admin?.sample) return json({ ok: true, sample: true, added: false })
      const added = await addSuggestion(s)
      return json({ ok: true, added, ...(added ? {} : { reason: 'duplicate-or-known' }) })
    }
    const key = typeof body.key === 'string' ? body.key.replace(/[^\w-]/g, '').slice(0, 40) : ''
    if (!key || (action !== 'accept' && action !== 'dismiss')) return json({ ok: false, error: 'invalid', message: 'That didn’t look right.' }, 400)
    if (admin?.sample) return json({ ok: true, sample: true })
    if (action === 'dismiss') {
      await dismissSuggestion(key)
      return json({ ok: true })
    }
    const made = await acceptSuggestion(key)
    return json({ ok: true, ...made })
  } catch (e) {
    if (e instanceof SuggestionError) return json({ ok: false, error: 'invalid', message: e.message }, 400)
    console.error('[admin] lead suggestion failed', e)
    return json({ ok: false, error: 'failed', message: 'That didn’t save. Nothing was changed.' }, 500)
  }
}
