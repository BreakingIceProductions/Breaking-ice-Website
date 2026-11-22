import { adminFromRequest } from '@/admin/auth'
import { createLead } from '@/admin/data'
import { json } from '@/portal/http'
import { PROJECT_TYPES } from '@/sanity/portal/office-constants'

export const runtime = 'nodejs'

const text = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

/**
 * The New project form: a job that's already agreed. Uses the same helper as New lead, so the
 * client is picked (by id) or made new with one contact, and the project starts in Onboarding,
 * the stage the Studio gives a new project. Emails nobody and runs no stage steps.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const title = text(body.title, 160)
  const clientId = text(body.clientId, 120)
  const company = text(body.company, 160)
  const name = text(body.name, 120)
  const email = text(body.email, 200).toLowerCase()
  const projectType = text(body.projectType, 40)
  const startDate = text(body.startDate, 10)

  if (!title) return json({ ok: false, error: 'invalid', message: 'Give the project a title.' }, 400)
  if (!clientId && !company) return json({ ok: false, error: 'invalid', message: 'Pick a client, or type the new organisation’s name.' }, 400)
  if (!clientId && !name) return json({ ok: false, error: 'invalid', message: 'Add the name of your contact there.' }, 400)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'invalid', message: 'That email doesn’t look right.' }, 400)
  if (projectType && !PROJECT_TYPES.some((t) => t.value === projectType)) return json({ ok: false, error: 'invalid', message: 'Pick a project type from the list.' }, 400)
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return json({ ok: false, error: 'invalid', message: 'That start date doesn’t look right.' }, 400)
  if (admin.sample) return json({ ok: true, sample: true })

  try {
    const made = await createLead({
      title,
      company,
      name: clientId ? '' : name,
      email: clientId ? '' : email,
      projectType: projectType || undefined,
      lead: {},
      clientId: clientId || undefined,
      stage: 'booked',
      startDate: startDate || undefined,
    })
    return json({ ok: true, ...made })
  } catch (e) {
    console.error('[admin] new project failed', e)
    const gone = e instanceof Error && e.message === 'client-not-found'
    return json({ ok: false, error: 'failed', message: gone ? 'That client couldn’t be found. Reload the page and pick again.' : 'The project didn’t save. Nothing was added.' }, gone ? 400 : 500)
  }
}
