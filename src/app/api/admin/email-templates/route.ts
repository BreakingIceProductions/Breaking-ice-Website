import { adminFromRequest } from '@/admin/auth'
import { cleanTemplate, deleteEmailTemplate, getEmailTemplates, safeKey, saveEmailTemplate, setEmailTemplateApproved } from '@/admin/email-templates'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/** The composer's templates: list them (GET), or add, save, approve, unapprove and delete (POST, not for view-only sign-ins). */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  return json({ ok: true, ...(await getEmailTemplates()) })
}

export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out', message: 'This sign-in can’t change things, or it has expired.' }, 401)
  const b = await req.json().catch(() => ({}))
  const k = safeKey(b.key)
  const { templates } = await getEmailTemplates()
  const known = templates.find((t) => t._key === k)

  try {
    if (b.action === 'save') {
      const input = cleanTemplate(b)
      if (typeof input === 'string') return json({ ok: false, error: 'invalid', message: input }, 400)
      if (b.key && !known) return json({ ok: false, error: 'not-found', message: 'That template isn’t there any more. Reload the page.' }, 404)
      const template = await saveEmailTemplate(input, known?._key)
      return json({ ok: true, template, ...(admin.sample && { sample: true }) })
    }
    if (b.action === 'approve' || b.action === 'unapprove' || b.action === 'delete') {
      if (!known) return json({ ok: false, error: 'not-found', message: 'That template isn’t there any more. Reload the page.' }, 404)
      if (b.action === 'delete') await deleteEmailTemplate(known._key)
      else await setEmailTemplateApproved(known._key, b.action === 'approve')
      return json({ ok: true, ...(b.action !== 'delete' && { template: { ...known, approved: b.action === 'approve' } }), ...(admin.sample && { sample: true }) })
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'too-many') return json({ ok: false, error: 'too-many', message: 'That’s the most templates the list holds. Delete one first.' }, 400)
    console.error('[admin] email template save failed', e)
    return json({ ok: false, error: 'failed', message: 'That didn’t save. Try again.' }, 500)
  }
  return json({ ok: false, error: 'invalid', message: 'Unknown action.' }, 400)
}
