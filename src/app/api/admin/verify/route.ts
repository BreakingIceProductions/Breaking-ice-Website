import { checkAdminCode, startAdminSession } from '@/admin/auth'
import { ipOf, json, limited, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  if (limited(`admin-verify:${ipOf(req)}`, 20, 15 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)
  const body = await req.json().catch(() => ({}))
  const r = await checkAdminCode(String(body.code ?? ''))
  if (!r.ok) return json({ ok: false, error: r.reason }, 400)
  await startAdminSession(r.email)
  return json({ ok: true })
}
