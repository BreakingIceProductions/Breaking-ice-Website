import { adminFromRequest } from '@/admin/auth'
import { adminEnv } from '@/admin/config'
import { addGuest, removeGuest } from '@/admin/guests'
import { normEmail } from '@/portal/auth'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

const DAYS = [1, 3, 7, 14, 30, 90]

/** { action: 'add', email, name, days } or { action: 'remove', key }. Only a full sign-in gets here: view-only ones are refused before this runs. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  if (admin.sample) return json({ ok: true, sample: true })
  if (body.action === 'remove') {
    await removeGuest(String(body.key ?? ''))
    return json({ ok: true })
  }
  const email = normEmail(String(body.email ?? '')).slice(0, 200)
  const days = Number(body.days)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, message: 'That email doesn’t look right.' }, 400)
  if (adminEnv.emails.includes(email)) return json({ ok: false, message: 'That address already has full access.' }, 400)
  if (!DAYS.includes(days)) return json({ ok: false, message: 'Pick how long they get.' }, 400)
  await addGuest(email, String(body.name ?? '').trim().slice(0, 80), days)
  return json({ ok: true })
}
