import { today } from './dates'
import { fiscalYear } from './fiscal'
import type { RecurringProfile } from './zoho'

/**
 * Projected income from Zoho Books recurring invoice profiles, for the Money page. Pure maths on what
 * Zoho returned: each active profile is walked from its next invoice date by its frequency, up to its
 * end date or 12 months out. Amounts are pre-tax (sub_total), the same basis as Collected and Signed.
 * Projected money is kept apart from collected money everywhere it's shown.
 */

export type ProjectedInvoice = { date: string; amount: number; customer: string; /** Zoho Books customer id. */ customerId?: string }

export type RecurringProjection = {
  /** What the active profiles bill in a typical month, before GST. */
  monthly: number
  clients: number
  profiles: number
  /** The soonest next invoice date. */
  next?: string
  invoices: ProjectedInvoice[]
  /** From today to the end of the fiscal year (Oct 31). */
  restOfYear: number
  /** From today, the next 12 months. */
  next12: number
  /** This fiscal year's projected invoices by month (index 0 = November, as fiscalYear().months); past months are 0. */
  byMonth: number[]
  /** Profiles left out because Zoho didn't give an amount, a next date or a frequency it can be walked by. */
  skipped: number
}

const UNIT: Record<string, 'day' | 'week' | 'month' | 'year'> = { day: 'day', days: 'day', daily: 'day', week: 'week', weeks: 'week', weekly: 'week', month: 'month', months: 'month', monthly: 'month', year: 'year', years: 'year', yearly: 'year' }
const PER_MONTH = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 } as const

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** The k-th date from an anchor, stepping `every` units. Months keep the anchor's day, clamped to short months. */
function step(anchor: string, unit: 'day' | 'week' | 'month' | 'year', every: number, k: number) {
  const [y, m, d] = anchor.split('-').map(Number)
  if (unit === 'day' || unit === 'week') {
    const t = Date.UTC(y, m - 1, d) + k * every * (unit === 'week' ? 7 : 1) * 86_400_000
    return new Date(t).toISOString().slice(0, 10)
  }
  const months = (m - 1) + k * every * (unit === 'year' ? 12 : 1)
  const yy = y + Math.floor(months / 12)
  const mm = (months % 12) + 1
  return ymd(yy, mm, Math.min(d, daysIn(yy, mm)))
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function projectRecurring(profiles: RecurringProfile[], t = today()): RecurringProjection {
  const [ty, tm, td] = t.split('-').map(Number)
  const horizon = ymd(ty + 1, tm, Math.min(td, daysIn(ty + 1, tm)))
  const fy = fiscalYear(t)
  const yearEnd = fy.end
  const invoices: ProjectedInvoice[] = []
  let monthly = 0
  let skipped = 0
  const customers = new Set<string>()
  let next: string | undefined
  let counted = 0
  for (const p of profiles) {
    const unit = UNIT[(p.recurrence_frequency ?? '').toLowerCase()]
    const every = Math.max(1, Math.floor(Number(p.repeat_every) || 1))
    const amount = typeof p.sub_total === 'number' && Number.isFinite(p.sub_total) ? p.sub_total : undefined
    const start = p.next_invoice_date?.slice(0, 10)
    if (!unit || amount === undefined || !start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      skipped += 1
      continue
    }
    const end = p.end_date && /^\d{4}-\d{2}-\d{2}/.test(p.end_date) ? p.end_date.slice(0, 10) : undefined
    const stop = end && end < horizon ? end : horizon
    const customer = p.customer_name ?? p.recurrence_name ?? 'Recurring invoice'
    counted += 1
    customers.add(p.customer_id ?? customer)
    monthly += (amount * PER_MONTH[unit]) / every
    for (let k = 0; k < 1000; k++) {
      const date = step(start, unit, every, k)
      if (date > stop) break
      // A next date already behind us (Zoho hasn't moved it on yet) isn't projected again.
      if (date < t) continue
      invoices.push({ date, amount, customer, customerId: p.customer_id })
      if (!next || date < next) next = date
    }
  }
  invoices.sort((a, b) => a.date.localeCompare(b.date))
  const byMonth = Array.from({ length: 12 }, () => 0)
  for (const i of invoices) {
    const k = fy.months.indexOf(i.date.slice(0, 7))
    if (k >= 0) byMonth[k] += i.amount
  }
  return {
    monthly: round2(monthly),
    clients: customers.size,
    profiles: counted,
    next,
    invoices,
    restOfYear: round2(invoices.filter((i) => i.date <= yearEnd).reduce((n, i) => n + i.amount, 0)),
    next12: round2(invoices.filter((i) => i.date < horizon).reduce((n, i) => n + i.amount, 0)),
    byMonth: byMonth.map(round2),
    skipped,
  }
}

/** One active profile's signed value for a fiscal year, and the day it counts from on the year chart. */
export type RetainerSigned = { on: string; value: number; customer: string; /** Zoho Books customer id. */ customerId?: string }

/**
 * Retainers as signed money for the fiscal year: every invoice a profile makes in the year, issued or
 * still to come, pre-tax sub_total each. It walks from the profile's start date (its first invoice;
 * the next invoice date when Zoho gives no start date) at its frequency, keeps the dates from the fiscal
 * year's start, and stops at the earlier of its end date and the fiscal year's end. So the figure stays
 * the same as the months pass. `on` is the start date clamped into the fiscal year and not after today,
 * so the year chart's Signed line steps up where the card already counts it.
 */
export function retainerSignedFor(profiles: RecurringProfile[], t = today()): RetainerSigned[] {
  const fy = fiscalYear(t)
  const out: RetainerSigned[] = []
  const isDay = (s?: string) => Boolean(s && /^\d{4}-\d{2}-\d{2}/.test(s))
  for (const p of profiles) {
    const unit = UNIT[(p.recurrence_frequency ?? '').toLowerCase()]
    const every = Math.max(1, Math.floor(Number(p.repeat_every) || 1))
    const amount = typeof p.sub_total === 'number' && Number.isFinite(p.sub_total) ? p.sub_total : undefined
    const anchor = isDay(p.start_date) ? p.start_date!.slice(0, 10) : isDay(p.next_invoice_date) ? p.next_invoice_date!.slice(0, 10) : undefined
    if (!unit || amount === undefined || amount <= 0 || !anchor) continue
    const end = isDay(p.end_date) ? p.end_date!.slice(0, 10) : undefined
    const stop = end && end < fy.end ? end : fy.end
    let value = 0
    let first: string | undefined
    for (let k = 0; k < 2000; k++) {
      const date = step(anchor, unit, every, k)
      if (date > stop) break
      if (date < fy.start) continue
      value += amount
      first ??= date
    }
    if (!value || !first) continue
    const start = anchor < fy.start ? fy.start : anchor
    out.push({ on: start > t ? (t < fy.start ? fy.start : t) : start, value: round2(value), customer: p.customer_name ?? p.recurrence_name ?? 'Recurring invoice', customerId: p.customer_id })
  }
  return out
}

/** One retainer client on the Money page's Still to bill card: this fiscal year's value, split into paid, invoiced and still to come. */
export type RetainerBillRow = {
  key: string
  client: string
  /** The portal client, when the Zoho customer is linked to one (boClient.zohoContactId). */
  clientId?: string
  /** Every invoice its profiles make this fiscal year, before GST (as in Signed). */
  total: number
  /** Mirrored retainer invoices dated this fiscal year: paid, and invoiced but not paid (before GST). */
  paid: number
  billedNotPaid: number
  /** Projected invoices from today to the fiscal year end: signed, not invoiced yet. */
  left: number
}

type RetainerPayment = { clientId: string; kind: string; status: string; amount: number; createdAt?: string }

/**
 * Still to bill for retainers, one row per Zoho customer. `left` is the projection from today to the
 * fiscal year end; once Zoho issues an invoice it leaves `left` and shows as billed (and in Owed) instead.
 */
export function retainerBillRows(
  signed: RetainerSigned[],
  invoices: ProjectedInvoice[],
  payments: RetainerPayment[],
  clients: Record<string, { clientId: string; name?: string }>,
  t = today(),
): RetainerBillRow[] {
  const fy = fiscalYear(t)
  const rows = new Map<string, RetainerBillRow>()
  const row = (customerId: string | undefined, customer: string) => {
    const key = customerId ?? customer
    const linked = customerId ? clients[customerId] : undefined
    const r = rows.get(key) ?? { key, client: linked?.name ?? customer, clientId: linked?.clientId, total: 0, paid: 0, billedNotPaid: 0, left: 0 }
    rows.set(key, r)
    return r
  }
  for (const s of signed) row(s.customerId, s.customer).total += s.value
  for (const i of invoices) if (i.date <= fy.end) row(i.customerId, i.customer).left += i.amount
  for (const r of rows.values()) {
    if (!r.clientId) continue
    const mine = payments.filter((p) => p.kind === 'retainer' && p.clientId === r.clientId && p.status !== 'canceled' && (p.createdAt ?? '').slice(0, 10) >= fy.start && (p.createdAt ?? '').slice(0, 10) <= fy.end)
    r.paid = round2(mine.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount, 0))
    r.billedNotPaid = round2(mine.filter((p) => p.status !== 'paid').reduce((n, p) => n + p.amount, 0))
  }
  return [...rows.values()].map((r) => ({ ...r, total: round2(r.total), left: round2(r.left) })).sort((a, b) => b.total - a.total)
}
