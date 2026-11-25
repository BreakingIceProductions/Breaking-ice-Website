import { adminFromRequest } from '@/admin/auth'
import { moneyView, paidCsv } from '@/admin/money'
import { loadMoney, loadRetainerForecast } from '@/admin/money-data'

export const runtime = 'nodejs'

/**
 * The Money page's "Paid this year" list as a CSV file: the same rows, in the same order, then the retainer
 * invoices still to come this fiscal year as rows of their own (Kind "Projected (retainers)"). Without Zoho
 * Books, it's the paid rows only.
 */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return new Response('Signed out', { status: 401 })
  const [{ projects, payments, goals }, forecast] = await Promise.all([loadMoney(), loadRetainerForecast()])
  const view = moneyView(projects, payments, goals)
  const projected = (forecast?.projection.invoices ?? [])
    .filter((i) => i.date <= view.fiscal.end)
    .map((i) => ({ date: i.date, amount: i.amount, client: (i.customerId && forecast?.clients[i.customerId]?.name) || i.customer }))
  return new Response(paidCsv(view.paidRows, projected), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="breaking-ice-paid-${view.year}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
