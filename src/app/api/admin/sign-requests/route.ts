import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { json } from '@/portal/http'
import { createSignRequest, emailSignRequest, signerUrl } from '@/portal/sign-service'
import { getRequest, getTemplate, voidRequest } from '@/portal/sign-store'

export const runtime = 'nodejs'
export const maxDuration = 30

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * { action: 'create', templateId, projectId?, values, recipient: { contactKey } | { name, email }, email?: true }
 * { action: 'email', id } · { action: 'void', id }
 * Email goes out only on these presses, once each. In sample mode it's simulated.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const b = await req.json().catch(() => ({}))
  const sample = Boolean(admin.sample)

  if (b.action === 'create') {
    const template = await getTemplate(str(b.templateId, 80))
    if (!template) return json({ ok: false, message: 'That document isn’t in the Library.' }, 404)
    const projectId = str(b.projectId, 200)
    const project = projectId ? await getProject(projectId) : null
    if (projectId && !project) return json({ ok: false, message: 'That project wasn’t found.' }, 404)
    const made = await createSignRequest({ template, project: project ?? undefined, values: typeof b.values === 'object' && b.values ? b.values : {}, recipient: typeof b.recipient === 'object' && b.recipient ? b.recipient : {} })
    if (!made.ok) return json({ ok: false, message: made.message }, 400)
    const r = made.request
    let emailed: Awaited<ReturnType<typeof emailSignRequest>> | undefined
    if (b.email === true) emailed = await emailSignRequest(r)
    return json({ ok: true, id: r._id, link: signerUrl(r), sample, emailed })
  }

  const r = await getRequest(str(b.id, 80))
  if (!r) return json({ ok: false, message: 'That request wasn’t found.' }, 404)
  if (b.action === 'email') {
    const e = await emailSignRequest(r)
    return e.ok ? json({ ok: true, simulated: e.simulated, sample }) : json({ ok: false, message: e.message }, 400)
  }
  if (b.action === 'void') {
    const v = await voidRequest(r._id)
    return v ? json({ ok: true, sample }) : json({ ok: false, message: 'A signed document can’t be withdrawn.' }, 409)
  }
  return json({ ok: false, error: 'invalid' }, 400)
}
