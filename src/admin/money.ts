import 'server-only'
import { methodLabel } from '@/portal/pay-methods'
import type { PortalPayment } from '@/portal/types'
import { PIPELINE_STAGES, PROJECT_TYPES } from '@/sanity/portal/office-constants'
import { daysBetween, today, ymd } from './dates'
import { LEAD_SOURCES } from './lead'
import type { OfficeProject } from './types'

/**
 * The sums behind the Money page. Pure functions over the projects and the portal payment
 * records: no fetching, no Zoho Books or Stripe calls. Zoho Books is the accounting record;
 * this is a reading of what the back office already has on file.
 *
 * Rules used throughout:
 *  - Amounts are CAD before GST. The one exception is what is still owed on an open invoice
 *    or payment request, which is the balance to come in (GST included where it is charged).
 *  - A day is a Mountain-time day ("YYYY-MM-DD").
 *  - Nothing is estimated. A figure with no recorded date or amount is left out and counted
 *    in `gaps`, so the page can say what is missing.
 */

export type MoneyProject = OfficeProject & { /** When the project record was made (not set in sample mode). */ _createdAt?: string }
export type Goals = { signedYear?: number; collectedYear?: number; leadsMonth?: number; winRate?: number }

const idx = (stage: string) => PIPELINE_STAGES.findIndex((s) => s.value === stage)
const BOOKED = idx('booked')
const QUOTED = idx('quoted')
const sum = (list: number[]) => list.reduce((a, b) => a + b, 0)
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null)
const day = (iso?: string) => (iso && !Number.isNaN(Date.parse(iso)) ? ymd(new Date(iso)) : undefined)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* ── Periods ────────────────────────────────────────────────────────── */

/** Days from..to, both included. No `from` means all time, which also takes in records with no date. */
export type Period = { from?: string; to: string }
const within = (d: string | undefined, r: Period) => (r.from ? Boolean(d && d >= r.from && d <= r.to) : true)

export const RANGES = [
  { key: '12m', label: 'Last 12 months' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
] as const
export type RangeKey = (typeof RANGES)[number]['key']

/** "Last 12 months" is this month and the eleven before it, so it lines up with the month charts. */
export function periodFor(range: RangeKey, t = today()): Period {
  if (range === 'all') return { to: t }
  if (range === 'year') return { from: `${t.slice(0, 4)}-01-01`, to: t }
  return { from: `${addMonths(t.slice(0, 7), -11)}-01`, to: t }
}

function addMonths(month: string, n: number) {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Every month from..to as "YYYY-MM". */
function monthsFrom(from: string, to: string) {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out
}

const monthLabel = (m: string, withYear: boolean) => `${MONTHS[Number(m.slice(5, 7)) - 1]}${withYear ? ` ${m.slice(0, 4)}` : ''}`

/* ── One project ────────────────────────────────────────────────────── */

/** The quote total before GST: the signed total when there is one, else the amount on the project. Retainers have none. */
export const quoteTotal = (p: OfficeProject) => (p.projectType === 'retainer' ? undefined : p.quote?.signature?.total ?? p.quoteAmount) || undefined

/** The day a lead came in: its first stage-history entry, its "Lead added" log line, or the day its record was made. */
export function leadDay(p: MoneyProject) {
  const stamps = [...(p.office.stageHistory ?? []).map((h) => h.at), ...(p.office.log ?? []).filter((l) => l.kind === 'lead').map((l) => l.at), p._createdAt]
  return day((stamps.filter(Boolean) as string[]).sort()[0])
}

/**
 * Signed means the project reached Onboarding (`booked`): it is there or past it now, or its quote
 * carries a signature. The day is the first move to `booked` in the stage history, or the signature's.
 * Null when it isn't signed; `on` is empty when it is signed but no day was recorded.
 */
export function signing(p: OfficeProject): { on?: string; value?: number } | null {
  const signature = p.quote?.signature
  if (idx(p.pipelineStage) < BOOKED && !signature) return null
  const stamps = [...(p.office.stageHistory ?? []).filter((h) => h.to === 'booked').map((h) => h.at), signature?.at]
  return { on: day((stamps.filter(Boolean) as string[]).sort()[0]), value: quoteTotal(p) }
}

export const OUTCOMES = [
  { key: 'signed', label: 'Signed' },
  { key: 'open', label: 'Still open' },
  { key: 'lost', label: 'Lost' },
  { key: 'not-a-fit', label: 'Not a fit' },
  { key: 'no-show', label: 'No-show' },
  { key: 'archived', label: 'Archived' },
] as const
export type Outcome = (typeof OUTCOMES)[number]['key']

/** Where a lead ended up, from the archive flags and the reason picked when it was archived. */
export function outcome(p: OfficeProject): Outcome {
  if (signing(p)) return 'signed'
  if (!p.archived && !p.declinedAt) return 'open'
  const why = p.office.lead?.lostReason
  if (why === 'lost' || why === 'not-a-fit' || why === 'no-show') return why
  // Declined with no reason on file counts as lost; a plain archive is neither won nor lost.
  return p.declinedAt ? 'lost' : 'archived'
}
const isDeclined = (o: Outcome) => o === 'lost' || o === 'not-a-fit' || o === 'no-show'

/* ── Requests for money ─────────────────────────────────────────────── */

/** Zoho Books statuses for an invoice that has been sent and isn't fully paid. */
const OPEN_INVOICE: Record<string, string> = { sent: 'Sent', viewed: 'Opened by the client', overdue: 'Overdue', unpaid: 'Unpaid', partially_paid: 'Partly paid' }
const GONE = new Set(['void', 'voided', 'deleted'])
const INVOICE_KIND = { deposit: 'Deposit invoice', final: 'Final invoice', retainer: 'Retainer invoice' }

/**
 * One request for money: a portal payment, or a Zoho Books invoice on record. When a payment and an
 * invoice are the same request (the payment names the invoice), it is counted once, as the payment,
 * because the payment knows the day it was paid and how.
 */
export type Bill = {
  key: string
  projectId: string
  project: string
  clientId: string
  client: string
  label: string
  source: 'payment' | 'invoice'
  /** Before GST. */
  amount: number
  /** paid; clearing (the client says it's sent); open (asked or invoiced, not paid); draft (not sent yet). */
  state: 'paid' | 'clearing' | 'open' | 'draft'
  status: string
  /** Still to come in, GST included where charged. Zero unless open or clearing. */
  owed: number
  /** The day it was asked for (payment) or the invoice was made. */
  asked?: string
  /** The day it was paid. For an invoice with no portal payment, the day the sync first saw it paid in Zoho Books. */
  paidOn?: string
  method?: string
  cardFee?: number
}

export function bills(projects: OfficeProject[], payments: PortalPayment[]): Bill[] {
  const byId = new Map(projects.map((p) => [p._id, p]))
  const live = payments.filter((x) => x.status !== 'canceled')
  const linked = new Set(live.map((x) => x.zohoInvoiceId).filter(Boolean))
  const who = (projectId: string, fallbackTitle?: string, fallbackClient = '') => {
    const p = byId.get(projectId)
    return { projectId, project: p?.title ?? fallbackTitle ?? 'Project not found', clientId: p?.client._id ?? fallbackClient, client: p?.client.organizationName ?? 'Client not found' }
  }
  const out: Bill[] = []
  for (const x of live) {
    const state = x.status === 'paid' ? 'paid' : x.status === 'processing' ? 'clearing' : 'open'
    out.push({
      ...who(x.projectId, x.projectTitle, x.clientId),
      key: x._id,
      label: `${x.label}${x.zohoInvoiceNumber ? ` · ${x.zohoInvoiceNumber}` : ''}`,
      source: 'payment',
      amount: x.amount,
      state,
      status: state === 'paid' ? 'Paid' : state === 'clearing' ? 'Client says it’s sent' : 'Asked in the portal',
      owed: state === 'paid' ? 0 : x.total,
      asked: day(x.createdAt),
      paidOn: state === 'paid' ? day(x.paidAt) : undefined,
      method: x.method,
      cardFee: x.cardFee,
    })
  }
  for (const p of projects) {
    for (const i of p.office.invoices ?? []) {
      const status = i.status ?? 'draft'
      if (linked.has(i.id) || GONE.has(status)) continue
      const state = status === 'paid' ? 'paid' : status in OPEN_INVOICE ? 'open' : 'draft'
      out.push({
        ...who(p._id),
        key: `${p._id}-${i._key}`,
        label: `${INVOICE_KIND[i.kind] ?? 'Invoice'}${i.number ? ` ${i.number}` : ''}`,
        source: 'invoice',
        amount: i.amount || 0,
        state,
        status: state === 'paid' ? 'Paid' : OPEN_INVOICE[status] ?? 'Draft, not sent',
        owed: state === 'open' ? i.outstanding ?? i.amount ?? 0 : 0,
        asked: day(i.createdAt),
        paidOn: state === 'paid' ? day(i.syncedAt) : undefined,
      })
    }
  }
  return out
}

/** Paid in the period, before GST. A part-paid invoice counts once it is paid in full. */
const collected = (all: Bill[], r: Period) => sum(all.filter((b) => b.state === 'paid' && within(b.paidOn, r)).map((b) => b.amount))

/* ── Signed, win rate, goals ────────────────────────────────────────── */

export function signedIn(projects: OfficeProject[], r: Period) {
  const list = projects.map(signing).filter((s): s is NonNullable<typeof s> => Boolean(s && within(s.on, r)))
  const values = list.map((s) => s.value).filter((v): v is number => Boolean(v))
  return { count: list.length, value: sum(values), withValue: values.length, average: values.length ? sum(values) / values.length : null }
}

/** Signed against declined in the period: "N signed of M decided". The rate is null when nothing was decided. */
export function winRate(projects: OfficeProject[], r: Period) {
  const signed = signedIn(projects, r).count
  const declined = projects.filter((p) => !signing(p) && p.declinedAt && within(day(p.declinedAt), r)).length
  return { signed, decided: signed + declined, rate: pct(signed, signed + declined) }
}

/**
 * A value against its goal. `pace` is where an even pace would be today (the goal times the share
 * of the year or month gone), and `gap` is the value minus that: negative is behind. A rate has no
 * pace, so its gap is the value minus the goal, in points.
 */
export type GoalLine = { key: keyof Goals; label: string; unit: 'money' | 'count' | 'rate'; value: number | null; note: string; goal?: number; share?: number; pace?: number; paceShare?: number; gap?: number }

function goalLine(base: Pick<GoalLine, 'key' | 'label' | 'unit' | 'value' | 'note'>, goal: number | undefined, gone: number | null): GoalLine {
  if (!goal || base.value === null) return { ...base, goal: goal || undefined }
  const pace = gone === null ? undefined : goal * gone
  return { ...base, goal, share: base.value / goal, pace, paceShare: gone ?? undefined, gap: base.value - (pace ?? goal) }
}

/* ── The Money view ─────────────────────────────────────────────────── */

export function moneyView(projects: MoneyProject[], payments: PortalPayment[], goals: Goals, t = today()) {
  const year = t.slice(0, 4)
  const month = t.slice(0, 7)
  const thisYear: Period = { from: `${year}-01-01`, to: t }
  const thisMonth: Period = { from: `${month}-01`, to: t }
  const all = bills(projects, payments)

  // How much of the year and of the month has gone, counting today.
  const daysInYear = daysBetween(`${year}-01-01`, `${Number(year) + 1}-01-01`)
  const yearGone = (daysBetween(`${year}-01-01`, t) + 1) / daysInYear
  const monthGone = Number(t.slice(8)) / daysBetween(`${month}-01`, `${addMonths(month, 1)}-01`)

  const signed = signedIn(projects, thisYear)
  const collectedYear = collected(all, thisYear)
  const leads = projects.filter((p) => within(leadDay(p), thisMonth)).length
  const win = winRate(projects, thisYear)
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

  const goalLines: GoalLine[] = [
    goalLine({ key: 'signedYear', label: `Signed in ${year}`, unit: 'money', value: signed.value, note: `${plural(signed.count, 'project')} reached Onboarding${signed.count > signed.withValue ? `, ${signed.count - signed.withValue} with no quote total` : ''}` }, goals.signedYear, yearGone),
    goalLine({ key: 'collectedYear', label: `Collected in ${year}`, unit: 'money', value: collectedYear, note: 'Payments and invoices recorded as paid' }, goals.collectedYear, yearGone),
    goalLine({ key: 'leadsMonth', label: `New leads in ${monthLabel(month, false)}`, unit: 'count', value: leads, note: 'Leads and projects first recorded this month' }, goals.leadsMonth, monthGone),
    goalLine({ key: 'winRate', label: `Win rate in ${year}`, unit: 'rate', value: win.rate, note: win.decided ? `${win.signed} signed of ${win.decided} decided` : 'Nothing signed or declined yet this year' }, goals.winRate, null),
  ]

  // Month by month: what was signed and collected, the running totals, and last year's collected.
  const signings = projects.map(signing).filter((s): s is NonNullable<typeof s> => Boolean(s?.on))
  const paid = all.filter((b) => b.state === 'paid')
  const inMonth = (m: string): Period => ({ from: `${m}-01`, to: `${m}-31` })
  let signedRun = 0
  let collectedRun = 0
  const months = MONTHS.map((label, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`
    const signedThen = sum(signings.filter((s) => within(s.on, inMonth(m))).map((s) => s.value ?? 0))
    const collectedThen = collected(paid, inMonth(m))
    signedRun += signedThen
    collectedRun += collectedThen
    return {
      label,
      future: m > month,
      signed: signedThen,
      collected: collectedThen,
      signedRun,
      collectedRun,
      /** Where an even pace to the signed goal stands at the end of this month. */
      pace: goals.signedYear ? (goals.signedYear * (i + 1)) / 12 : undefined,
      lastYear: collected(paid, inMonth(`${Number(year) - 1}-${m.slice(5)}`)),
    }
  })

  // Owed: sent invoices and portal requests not paid yet. The balance to come in, GST included where charged.
  const owedRows = all.filter((b) => b.state === 'open' || b.state === 'clearing').sort((a, b) => (a.asked ?? '').localeCompare(b.asked ?? ''))

  // Still to bill: each active project's quote total, less everything asked for or invoiced (drafts not sent don't count).
  const active = projects.filter((p) => !p.archived && idx(p.pipelineStage) >= BOOKED && idx(p.pipelineStage) <= idx('delivered'))
  const toBillRows = active.map((p) => {
    const mine = all.filter((b) => b.projectId === p._id && b.state !== 'draft')
    const total = quoteTotal(p)
    const paidSoFar = sum(mine.filter((b) => b.state === 'paid').map((b) => b.amount))
    const billed = sum(mine.map((b) => b.amount))
    return {
      projectId: p._id,
      project: p.title,
      client: p.client.organizationName,
      total,
      paid: paidSoFar,
      billedNotPaid: billed - paidSoFar,
      left: total === undefined ? undefined : Math.max(0, total - billed),
      /** Why there is no figure. */
      reason: total !== undefined ? undefined : p.projectType === 'retainer' ? 'Retainer: billed monthly, no quote total' : 'No quote total on record',
    }
  })

  // This year's paid list, newest first. The CSV download is these same rows.
  const paidRows = paid.filter((b) => within(b.paidOn, thisYear)).sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? ''))

  const methodRows = group(paidRows.filter((b) => b.source === 'payment'), (b) => methodLabel(b.method) || 'Not recorded')
  const clientRows = group(paidRows, (b) => b.client).slice(0, 5)

  return {
    year,
    /** The share of the year gone, counting today: where "today" sits on the year chart. */
    yearGone,
    monthLabel: monthLabel(month, false),
    goalLines,
    months,
    hasLastYear: months.some((m) => m.lastYear > 0),
    owed: { total: sum(owedRows.map((b) => b.owed)), rows: owedRows, clearing: owedRows.filter((b) => b.state === 'clearing').length },
    toBill: { total: sum(toBillRows.map((r) => r.left ?? 0)), rows: toBillRows, counted: toBillRows.filter((r) => r.left !== undefined).length },
    collectedMonth: { total: collected(all, thisMonth), count: paid.filter((b) => within(b.paidOn, thisMonth)).length },
    methodRows,
    clientRows,
    paidRows,
    gaps: gaps(projects, all),
  }
}

/** Totals by a label, biggest first. */
function group(list: Bill[], labelOf: (b: Bill) => string) {
  const map = new Map<string, { label: string; amount: number; count: number }>()
  for (const b of list) {
    const row = map.get(labelOf(b)) ?? { label: labelOf(b), amount: 0, count: 0 }
    row.amount += b.amount
    row.count += 1
    map.set(row.label, row)
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

/** What couldn't be placed, so the page can say so rather than guess. */
function gaps(projects: MoneyProject[], all: Bill[]) {
  const signings = projects.map(signing).filter(Boolean) as { on?: string; value?: number }[]
  const paidNoDay = all.filter((b) => b.state === 'paid' && !b.paidOn)
  return {
    /** Signed, but with no stage history or signature to date it (work from before the back office). */
    signedNoDay: signings.filter((s) => !s.on).length,
    signedNoValue: signings.filter((s) => !s.value).length,
    paidNoDay: paidNoDay.length,
    paidNoDayAmount: sum(paidNoDay.map((b) => b.amount)),
    leadNoDay: projects.filter((p) => !leadDay(p)).length,
    /** Part-paid invoices: the paid part isn't on record separately, so it waits until the invoice is paid in full. */
    partlyPaid: all.filter((b) => b.status === 'Partly paid').length,
  }
}

/** The "Paid this year" list as CSV text. */
export function paidCsv(rows: Bill[]) {
  const cell = (v: string | number | undefined) => {
    const s = String(v ?? '')
    // A leading =, +, - or @ would run as a formula in a spreadsheet.
    const safe = /^[=+\-@]/.test(s) && typeof v !== 'number' ? `'${s}` : s
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const head = ['Paid on', 'Client', 'Project', 'What', 'Amount before GST (CAD)', 'How', 'Card fee (CAD)', 'Record']
  const lines = rows.map((b) => [b.paidOn, b.client, b.project, b.label, b.amount.toFixed(2), b.source === 'payment' ? methodLabel(b.method) : 'Zoho Books invoice', b.cardFee ? b.cardFee.toFixed(2) : '', b.source === 'payment' ? 'Portal payment' : 'Invoice'])
  return [head, ...lines].map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n'
}

/* ── The Reports view ───────────────────────────────────────────────── */

/** The funnel's steps, and the stage that counts as reaching each. "Had a call" is Quote to write: the call is done. */
const FUNNEL = [
  { label: 'New leads', stage: 'lead' },
  { label: 'Had a call', stage: 'proposal' },
  { label: 'Got a quote', stage: 'quoted' },
  { label: 'Signed', stage: 'booked' },
] as const

/** The furthest stage a project reached: where it is now or anywhere its history has been. Past Quoted only if signed. */
function furthest(p: OfficeProject) {
  if (signing(p)) return BOOKED
  const seen = [p.pipelineStage, ...(p.office.stageHistory ?? []).map((h) => h.to)].map(idx)
  return Math.min(Math.max(...seen), QUOTED)
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function reportView(projects: MoneyProject[], payments: PortalPayment[], range: RangeKey, t = today()) {
  const r = periodFor(range, t)
  const all = bills(projects, payments)
  // The leads that came in during the period. The sections below follow these same leads through.
  const cohort = projects.filter((p) => within(leadDay(p), r))
  const signed = signedIn(projects, r)
  const win = winRate(projects, r)

  /** Leads split by a label, with how many signed and how many were decided (signed or declined). */
  const split = (labels: { title: string; value: string }[], valueOf: (p: MoneyProject) => string | undefined) =>
    [...labels, { title: 'Not recorded', value: '' }]
      .map((l) => {
        const list = cohort.filter((p) => (labels.some((x) => x.value === valueOf(p)) ? valueOf(p) : '') === l.value)
        const won = list.filter((p) => outcome(p) === 'signed').length
        const decided = won + list.filter((p) => isDeclined(outcome(p))).length
        return { label: l.title, leads: list.length, signed: won, decided, rate: pct(won, decided), share: pct(won, list.length) }
      })
      .filter((row) => row.leads > 0)
      .sort((a, b) => b.leads - a.leads)

  const reached = cohort.map(furthest)
  const funnel = FUNNEL.map((step, i) => {
    const count = reached.filter((n) => n >= idx(step.stage)).length
    const before = i ? reached.filter((n) => n >= idx(FUNNEL[i - 1].stage)).length : null
    return { label: step.label, count, ofBefore: before === null ? null : pct(count, before), ofAll: pct(count, cohort.length) }
  })

  const outcomes = OUTCOMES.map((o) => ({ label: o.label, count: cohort.filter((p) => outcome(p) === o.key).length }))

  const dated = cohort.map(leadDay).filter(Boolean) as string[]
  const weekdays = WEEKDAYS.map((label, i) => ({ label, count: dated.filter((d) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7 === i).length }))

  // Money by month across the period. All time starts at the first dated signing or payment, and goes by year past two years.
  const signings = projects.map(signing).filter((s): s is { on: string; value?: number } => Boolean(s?.on))
  const paid = all.filter((b) => b.state === 'paid' && b.paidOn)
  const first = r.from ?? [...signings.map((s) => s.on), ...paid.map((b) => b.paidOn!)].sort()[0]
  const monthKeys = first ? monthsFrom(first.slice(0, 7), t.slice(0, 7)) : []
  const byYear = monthKeys.length > 24
  const buckets = byYear ? [...new Set(monthKeys.map((m) => m.slice(0, 4)))] : monthKeys
  const spansYears = new Set(monthKeys.map((m) => m.slice(0, 4))).size > 1
  const moneyByMonth = buckets.map((b) => ({
    label: byYear ? b : monthLabel(b, spansYears),
    signed: sum(signings.filter((s) => s.on.startsWith(b)).map((s) => s.value ?? 0)),
    collected: sum(paid.filter((x) => x.paidOn!.startsWith(b)).map((x) => x.amount)),
  }))

  const pipeline = PIPELINE_STAGES.filter((s) => s.group === 'sales').map((s) => ({ label: s.title as string, count: projects.filter((p) => !p.archived && p.pipelineStage === s.value).length }))

  return {
    period: r,
    leads: cohort.length,
    win,
    signed,
    collected: collected(all, r),
    sources: split(LEAD_SOURCES, (p) => p.office.lead?.source),
    types: split(PROJECT_TYPES, (p) => p.projectType),
    funnel,
    outcomes,
    weekdays,
    weekdayCount: dated.length,
    moneyByMonth,
    byYear,
    pipeline,
    gaps: gaps(projects, all),
  }
}
