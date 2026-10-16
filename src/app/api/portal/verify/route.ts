import { checkCode, startSession } from '@/portal/auth'
import { findClientsByEmail } from '@/portal/data'
import { ipOf, json, limited, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  if (limited(`verify:${ipOf(req)}`, 20, 15 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)
  const body = await req.json().catch(() => ({}))
  const r = await checkCode(String(body.code ?? ''))
  if (!r.ok) return json({ ok: false, error: r.reason }, 400)
  // A correct code for an address that isn't a contact still gets nowhere.
  if (!(await findClientsByEmail(r.email)).length) return json({ ok: false, error: 'wrong' }, 400)
  await startSession(r.email)
  const next = typeof body.next === 'string' && body.next.startsWith('/portal') ? body.next : '/portal'
  return json({ ok: true, next })
}
