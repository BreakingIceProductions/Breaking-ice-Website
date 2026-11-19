import { adminFromRequest } from '@/admin/auth'
import { GOAL_KEYS, setGoals } from '@/admin/money-data'
import type { Goals } from '@/admin/money'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

const MAX = { signedYear: 100_000_000, collectedYear: 100_000_000, leadsMonth: 10_000, winRate: 100 }

/** { signedYear, collectedYear, leadsMonth, winRate }: whole numbers; empty or 0 clears a goal. Full sign-ins only. */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const goals: Goals = {}
  for (const k of GOAL_KEYS) {
    const raw = String(body?.[k] ?? '').replace(/[$,%\s]/g, '')
    if (!raw) continue
    const n = Math.round(Number(raw))
    if (!Number.isFinite(n) || n < 0 || n > MAX[k]) return json({ ok: false, message: k === 'winRate' ? 'The win rate goal is a percentage from 0 to 100.' : 'Goals are plain numbers, like 250000.' }, 400)
    if (n) goals[k] = n
  }
  if (admin.sample) return json({ ok: true, sample: true })
  await setGoals(goals)
  return json({ ok: true })
}
