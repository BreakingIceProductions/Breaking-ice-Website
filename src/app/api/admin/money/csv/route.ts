import { adminFromRequest } from '@/admin/auth'
import { moneyView, paidCsv } from '@/admin/money'
import { loadMoney } from '@/admin/money-data'

export const runtime = 'nodejs'

/** The Money page's "Paid this year" list as a CSV file: the same rows, in the same order. */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return new Response('Signed out', { status: 401 })
  const { projects, payments, goals } = await loadMoney()
  const view = moneyView(projects, payments, goals)
  return new Response(paidCsv(view.paidRows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="breaking-ice-paid-${view.year}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
