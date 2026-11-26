import type { QuoteOption, QuoteRetainer, RetainerChoice } from './types'

/**
 * Retainer quotes: one monthly price per option, an optional buyout on every invoice,
 * and an optional archive licence, paid on the first invoice or spread across all of them. Pure maths, client and server.
 */

export const optionMonthly = (o: QuoteOption, months: number) => o.monthly ?? Math.round((o.total / months) * 100) / 100

/** What a choice costs. Archive needs the buyout when the quote says so. */
export function retainerChoice(r: QuoteRetainer, o: QuoteOption, want: { buyout?: boolean; archive?: boolean; archiveSpread?: boolean }): RetainerChoice {
  const buyout = Boolean(want.buyout && r.buyout && o.buyoutMonthly)
  const archive = Boolean(want.archive && r.archive && (!r.archive.requiresBuyout || buyout))
  const archiveTotal = archive ? r.archive!.total : undefined
  const archiveSpread = Boolean(archive && want.archiveSpread)
  const archiveMonthly = archiveSpread ? Math.round((archiveTotal! / r.months) * 100) / 100 : undefined
  const monthly = optionMonthly(o, r.months) + (buyout ? o.buyoutMonthly! : 0) + (archiveMonthly ?? 0)
  return {
    monthly,
    buyout,
    buyoutMonthly: buyout ? o.buyoutMonthly : undefined,
    archive,
    archiveTotal,
    archiveSpread: archive ? archiveSpread : undefined,
    archiveMonthly,
    first: monthly + (archive && !archiveSpread ? archiveTotal! : 0),
    year: monthly * r.months + (archive && !archiveSpread ? archiveTotal! : 0),
    start: r.start,
    months: r.months,
  }
}

/** "January 2027" for a YYYY-MM, plus i months. */
export function monthName(start: string, i = 0) {
  const [y, m] = start.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + i, 1))
  return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** One line per invoice: the month and its amount (an archive paid once rides the first). */
export const invoiceSchedule = (c: RetainerChoice) =>
  Array.from({ length: c.months }, (_, i) => ({ month: monthName(c.start, i), amount: i === 0 ? c.first : c.monthly, archive: i === 0 && c.archive && !c.archiveSpread }))

export const cad0 = (n: number) => `$${n.toLocaleString('en-CA', { maximumFractionDigits: 2 })}`

/** Lines for the certificate, the notification and the billing page. */
export function retainerLines(c: RetainerChoice, r?: QuoteRetainer) {
  const lines = [`Monthly: ${cad0(c.monthly)} × ${c.months} (${monthName(c.start)} to ${monthName(c.start, c.months - 1)})`]
  lines.push(c.buyout ? `${r?.buyout?.name ?? 'Media buyout'}: yes (+${cad0(c.buyoutMonthly ?? 0)}/month, included above)` : `${r?.buyout?.name ?? 'Media buyout'}: no`)
  if (r?.archive || c.archive) lines.push(c.archive ? `${r?.archive?.name ?? 'Archive licence'}: yes (${cad0(c.archiveTotal ?? 0)}, ${c.archiveSpread ? `spread monthly, +${cad0(c.archiveMonthly ?? 0)}/month, included above` : 'on the first invoice'})` : `${r?.archive?.name ?? 'Archive licence'}: no`)
  lines.push(`First invoice: ${cad0(c.first)} (${monthName(c.start)})`)
  return lines
}
