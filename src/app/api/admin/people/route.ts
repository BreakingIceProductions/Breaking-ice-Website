import { adminFromRequest } from '@/admin/auth'
import { changePeople } from '@/admin/people'
import { PEOPLE_ACTIONS, PeopleError, type PeopleActionName } from '@/admin/people-shared'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

/**
 * One change to the people list: { action: 'tag' | 'untag' | 'savePerson' | 'removePerson' | 'renameTag' | 'deleteTag', … }
 * (the fields each one takes are on PeopleAction). Only a full sign-in gets here: view-only ones are refused
 * before this runs. Every value is checked again on the server, against a fresh read of the list.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !PEOPLE_ACTIONS.includes(body.action as PeopleActionName)) return json({ ok: false, message: 'That didn’t look right.' }, 400)
  if (admin.sample) return json({ ok: true, sample: true })
  try {
    const { key } = await changePeople(body)
    return json({ ok: true, ...(key && { key }) })
  } catch (e) {
    if (e instanceof PeopleError) return json({ ok: false, message: e.message }, 400)
    console.error('[admin] people change failed', e)
    return json({ ok: false, message: 'That didn’t save. Nothing was changed.' }, 500)
  }
}
