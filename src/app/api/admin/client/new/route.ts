import { adminFromRequest } from '@/admin/auth'
import { createOfficeClient } from '@/admin/data'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

const text = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

/**
 * The New client form: an organisation and one contact. An organisation or email that's already
 * here opens the existing client instead of making a second one. Emails nobody.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out', message: 'This sign-in can’t add clients (view only), or it has expired. Sign in again and try once more.' }, 401)
  if (admin.viewOnly) return json({ ok: false, error: 'view-only', message: 'This sign-in is view only, so it can’t add clients.' }, 403)
  const body = await req.json().catch(() => ({}))
  const company = text(body.company, 160)
  const name = text(body.name, 120)
  const email = text(body.email, 200).toLowerCase()
  const role = text(body.role, 80)
  const phone = text(body.phone, 40)
  const getsEmails = body.getsEmails === true

  if (!company) return json({ ok: false, error: 'invalid', field: 'company', message: 'Type the organisation’s name.' }, 400)
  if (!name) return json({ ok: false, error: 'invalid', field: 'name', message: 'Add the name of your contact there.' }, 400)
  if (!email) return json({ ok: false, error: 'invalid', field: 'email', message: 'Add their email. It’s how they sign in to the portal.' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'invalid', field: 'email', message: 'That email doesn’t look right. Check it and try again.' }, 400)
  if (admin.sample) return json({ ok: true, sample: true })

  try {
    const made = await createOfficeClient({ company, name, email, role: role || undefined, phone: phone || undefined, getsEmails })
    if (made.draftOnly) return json({ ok: false, error: 'draft', message: 'A client with that name or email is still being written in the editor. Publish it there instead of adding it again.' }, 409)
    return json({ ok: true, id: made.id, existing: made.existing })
  } catch (e) {
    console.error('[admin] new client failed', e)
    return json({ ok: false, error: 'failed', message: 'The client didn’t save. Nothing was added. Try again in a moment.' }, 500)
  }
}
