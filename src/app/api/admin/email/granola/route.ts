import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { callPeople } from '@/admin/email-templates'
import { GranolaError, granolaReady, listCallNotes, type CallNote } from '@/admin/granola'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

/**
 * "Draft from a call", step one: { projectId } → Granola notes from the last 60 days, the ones with
 * this lead's people on the invite (or named in the title) first. Only titles and dates come back;
 * the note itself is read on the server when the draft is written.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out', message: 'This sign-in can’t do that, or it has expired.' }, 401)
  const b = await req.json().catch(() => ({}))
  const p = await getProject(String(b.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found', message: 'That project isn’t there any more. Reload the page.' }, 404)

  if (admin.sample) {
    const notes: CallNote[] = [
      { id: 'not_SampleCall0001', title: `Call with ${p.client.organizationName}`, at: day(1), match: 'attendee' },
      { id: 'not_SampleCall0002', title: `${p.title} – intro chat`, at: day(9), match: 'title' },
      { id: 'not_SampleCall0003', title: 'Weekly planning', at: day(3) },
    ]
    return json({ ok: true, sample: true, notes })
  }
  if (!granolaReady()) return json({ ok: false, error: 'granola-off', message: 'Connect Granola: add GRANOLA_API_KEY in Vercel.' }, 503)

  try {
    const notes = await listCallNotes(callPeople(p))
    return json({ ok: true, notes })
  } catch (e) {
    if (e instanceof GranolaError) return json({ ok: false, error: 'granola', message: e.message }, e.status === 401 ? 503 : 502)
    console.error('[admin] granola list failed', e)
    return json({ ok: false, error: 'failed', message: 'Couldn’t reach Granola. Try again in a minute.' }, 502)
  }
}
