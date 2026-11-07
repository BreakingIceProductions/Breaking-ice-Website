import { adminFromRequest } from '@/admin/auth'
import { getProject, setOffice } from '@/admin/data'

export const runtime = 'nodejs'

/** Form post from the dashboard: projectId and key. Hides that one reminder; a new wait shows again. */
export async function POST(req: Request) {
  const back = new URL('/admin', req.url)
  const admin = await adminFromRequest(req)
  if (!admin) return Response.redirect(new URL('/admin/sign-in', req.url), 303)
  const form = await req.formData().catch(() => null)
  const key = String(form?.get('key') ?? '').slice(0, 200)
  const p = await getProject(String(form?.get('projectId') ?? ''))
  if (p && key && !admin.sample && !(p.office.dismissed ?? []).includes(key)) {
    await setOffice(p._id, { dismissed: [...(p.office.dismissed ?? []), key].slice(-40) })
  }
  return Response.redirect(back, 303)
}
