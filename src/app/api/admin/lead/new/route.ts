import { adminFromRequest } from '@/admin/auth'
import { createLead } from '@/admin/data'
import { cleanLeadPatch } from '@/admin/lead'
import { json } from '@/portal/http'
import { PROJECT_TYPES } from '@/sanity/portal/office-constants'

export const runtime = 'nodejs'

const text = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

/**
 * The New lead form. Finds or makes the client, makes the project in the New lead stage and
 * answers with its id. Emails nobody.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const name = text(body.name, 120)
  const email = text(body.email, 200).toLowerCase()
  const company = text(body.company, 160) || name
  const title = text(body.title, 160) || `${company} project`
  const projectType = text(body.projectType, 40)
  const lead = cleanLeadPatch({ phone: String(body.phone ?? ''), budget: String(body.budget ?? ''), source: String(body.source ?? ''), notes: String(body.notes ?? '') })
  if (!name) return json({ ok: false, error: 'invalid', message: 'Add their name.' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'invalid', message: 'That email doesn’t look right.' }, 400)
  if (!lead || (projectType && !PROJECT_TYPES.some((t) => t.value === projectType))) return json({ ok: false, error: 'invalid', message: 'Something in the form isn’t right. Check it and try again.' }, 400)
  if (admin.sample) return json({ ok: true, sample: true })
  try {
    const made = await createLead({ name, email, company, title, projectType: projectType || undefined, lead })
    return json({ ok: true, ...made })
  } catch (e) {
    console.error('[admin] new lead failed', e)
    return json({ ok: false, error: 'failed', message: 'The lead didn’t save. Nothing was added.' }, 500)
  }
}
