import Link from 'next/link'
import { PendingLink } from '@/admin/ui/pending-link'
import '../../../css/admin-pages.css'
import '../../../css/admin-simple-b.css'
import { requireAdmin } from '@/admin/auth'
import { daysBetween, fmtDate, today } from '@/admin/dates'
import { cad } from '@/admin/insights'
import { moneyView, RANGES, reportView, type GoalLine, type RangeKey } from '@/admin/money'
import { loadMoney } from '@/admin/money-data'
import { GoalsForm } from '@/admin/ui/goals-form'
import { Donut, MiniCols, Ring, SplitBar } from '@/admin/ui/graphics'
import { BarList, YearLines } from '@/admin/ui/money-charts'
import { AgeChip, Chip, ColChart, GoalRing, Initials, type ChipTone } from '@/admin/ui/viz'
import { methodLabel } from '@/portal/pay-methods'
import { PhoneFold } from '../_fold'

export const metadata = { title: 'Money' }

type Props = { searchParams: Promise<{ view?: string | string[]; range?: string | string[] }> }

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
const DASH = '—'
const moneyTab = (projectId: string) => `/admin/projects/${encodeURIComponent(projectId)}?tab=money`
const longDay = (d?: string) => fmtDate(d) || DASH
/** "$140k": for ring captions, where the exact figure is in the ring's label. */
const short = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : cad(n))

/** Money and Reports: what the back office's own records add up to. Zoho Books stays the accounting record. */
export default async function Money({ searchParams }: Props) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const view = one(sp.view) === 'reports' ? 'reports' : 'money'
  const range: RangeKey = RANGES.find((r) => r.key === one(sp.range))?.key ?? '12m'
  const data = await loadMoney()
  return (
    <div className={`a-page mn sb-page${view === 'money' ? ' mn-money' : ''}`}>
      <div className="a-pending-scope stack sb-gap">
        <header className="sb-head">
          <h1 className="a-h1">Money</h1>
          <nav className="pj-tabs" aria-label="Money views">
            <PendingLink href="/admin/money" aria-current={view === 'money' ? 'page' : undefined}>Money</PendingLink>
            <PendingLink href="/admin/money?view=reports" aria-current={view === 'reports' ? 'page' : undefined}>Reports</PendingLink>
          </nav>
        </header>
        <div className="a-pending-body stack sb-gap">
          {view === 'money' ? <MoneyView data={data} canEdit={!admin.viewOnly} /> : <ReportsView data={data} range={range} />}
        </div>
      </div>
    </div>
  )
}

type Data = Awaited<ReturnType<typeof loadMoney>>

/* ── Money ──────────────────────────────────────────────────────────── */

const goalValue = (g: GoalLine) => (g.value === null ? DASH : g.unit === 'money' ? cad(g.value) : g.unit === 'rate' ? `${g.value}%` : String(g.value))
const goalOf = (g: GoalLine) => (!g.goal ? '' : g.unit === 'money' ? cad(g.goal) : g.unit === 'rate' ? `${g.goal}%` : String(g.goal))

/** "78% there · $12,000 behind pace", or the gap to the goal itself for a rate. */
function goalProgress(g: GoalLine) {
  if (g.value === null) return 'Nothing decided yet, so no rate'
  if (!g.goal || g.gap === undefined || g.share === undefined) return 'No goal set'
  if (g.unit === 'rate') return g.gap === 0 ? 'On the goal' : `${plural(Math.abs(g.gap), 'point')} ${g.gap < 0 ? 'under' : 'over'} the goal`
  const size = g.unit === 'money' ? cad(Math.abs(g.gap)) : String(Math.round(Math.abs(g.gap)))
  const even = g.unit === 'money' ? Math.abs(g.gap) < 0.5 : Math.round(Math.abs(g.gap)) === 0
  return `${Math.round(g.share * 100)}% there · ${even ? 'on pace' : `${size} ${g.gap < 0 ? 'behind' : 'ahead of'} pace`}`
}

/** The goal's state as one word and a tone. */
function goalChip(g: GoalLine): { text: string; tone: ChipTone } | null {
  if (!g.goal || g.value === null || g.gap === undefined) return null
  const even = g.unit === 'money' ? Math.abs(g.gap) < 0.5 : Math.round(Math.abs(g.gap)) === 0
  if (even) return { text: 'On pace', tone: 'ok' }
  if (g.unit === 'rate') return g.gap < 0 ? { text: 'Under', tone: 'warm' } : { text: 'Over', tone: 'ok' }
  return g.gap < 0 ? { text: 'Behind', tone: 'warm' } : { text: 'Ahead', tone: 'ok' }
}

/** The goal label without the year or month, which the card heading already gives. */
const ringLabel = (g: GoalLine) => g.label.replace(/ in .*$/, '')

/** Short status words for an owed line; the full status stays in the chip's label. */
const STATUS_WORD: Record<string, { text: string; tone: ChipTone }> = {
  'Client says it’s sent': { text: 'Clearing', tone: 'info' },
  'Asked in the portal': { text: 'Asked', tone: 'muted' },
  'Opened by the client': { text: 'Opened', tone: 'muted' },
  Overdue: { text: 'Overdue', tone: 'hot' },
  'Partly paid': { text: 'Part paid', tone: 'info' },
}

function MoneyView({ data, canEdit }: { data: Data; canEdit: boolean }) {
  const v = moneyView(data.projects, data.payments, data.goals)
  const t = today()
  const ageOf = (d?: string) => (d ? Math.max(0, daysBetween(d, t)) : null)
  const oldest = v.owed.rows.reduce<number | null>((n, b) => { const a = ageOf(b.asked); return a === null ? n : Math.max(n ?? 0, a) }, null)
  const current = v.months.filter((m) => !m.future).at(-1)
  const lastYear = String(Number(v.year) - 1)
  const quotedWork = v.toBill.rows.filter((r) => r.total !== undefined && r.left !== undefined)
  const billParts = (paid: number, billed: number, left: number) => [
    { label: 'Paid', value: paid, text: cad(paid), tone: 'accent' as const },
    { label: 'Billed, not paid', value: billed, text: cad(billed), tone: 'soft' as const },
    { label: 'Left to bill', value: left, text: cad(left), tone: 'dashed' as const },
  ]
  const sumOf = (pick: (r: (typeof quotedWork)[number]) => number) => quotedWork.reduce((n, r) => n + pick(r), 0)
  const paidTotal = v.paidRows.reduce((n, b) => n + b.amount, 0)
  const paidLine = v.paidRows.length ? `${cad(paidTotal)} · ${plural(v.paidRows.length, 'payment')}` : 'None yet'
  const monthsLabel = `Paid by month in ${v.year}: ${v.months.filter((m) => !m.future).map((m) => `${m.label} ${cad(m.collected)}`).join(', ')}${v.hasLastYear ? `. ${lastYear}: ${v.months.map((m) => `${m.label} ${cad(m.lastYear)}`).join(', ')}` : ''}.`

  return (
    <>
      <div className="sb-hero-row">
        <a href="#owed" className="sb-hero">
          <span className="sb-eyebrow">Owed to you</span>
          <span className="sb-hero-num">{cad(v.owed.total)}</span>
          <span className="sb-hero-sub">
            {v.owed.rows.length ? `${v.owed.rows.length} open` : 'Nothing open'}
            {oldest !== null ? ` · oldest ${plural(oldest, 'day')}` : ''}
            {v.owed.clearing ? ` · ${v.owed.clearing} clearing` : ''}
          </span>
        </a>

        <section className="sb-card sb-goals" aria-labelledby="mn-goals-h">
          <div className="sb-card-head">
            <h2 id="mn-goals-h" className="a-h2">Goals for {v.year}</h2>
            {canEdit && <GoalsForm goals={data.goals} />}
          </div>
          <ul className="sb-rings">
            {v.goalLines.map((g) => {
              const chip = goalChip(g)
              const rate = g.unit === 'rate'
              const share = !g.goal || g.value === null ? null : rate ? g.value / 100 : g.share ?? 0
              const tick = !g.goal || g.value === null ? undefined : rate ? g.goal / 100 : g.paceShare
              const mid = g.value === null ? DASH : rate ? `${g.value}%` : g.goal && g.share !== undefined ? `${Math.round(g.share * 100)}%` : g.unit === 'money' ? short(g.value) : String(g.value)
              return (
                <li key={g.key}>
                  <GoalRing share={share} tick={tick} size={88} label={`${g.label}: ${goalValue(g)}${g.goal ? ` of a ${goalOf(g)} goal` : ''}. ${goalProgress(g)}. ${g.note}.${tick !== undefined ? ` The copper tick marks ${rate ? 'the goal' : 'an even pace to today'}.` : ''}`}>{mid}</GoalRing>
                  <span className="sb-ring-label">{ringLabel(g)}</span>
                  <span className="sb-ring-val">{g.unit === 'money' && g.value !== null ? short(g.value) : goalValue(g)}{g.goal ? ` / ${g.unit === 'money' ? short(g.goal) : goalOf(g)}` : ''}</span>
                  {chip && <Chip tone={chip.tone}>{chip.text}</Chip>}
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <section className="sb-card" aria-labelledby="mn-months-h">
        <div className="sb-card-head">
          <h2 id="mn-months-h" className="a-h2">Paid by month</h2>
          <a href="#paid" className="sb-figure" title={`${plural(v.collectedMonth.count, 'payment')} recorded as paid in ${v.monthLabel}`}>
            {cad(v.collectedMonth.total)} <span className="sb-figure-unit">in {v.monthLabel}</span>
          </a>
        </div>
        <ColChart
          label={monthsLabel}
          legend={v.hasLastYear ? [v.year, lastYear] : undefined}
          cols={v.months.map((m) => ({ label: m.label, short: m.label.slice(0, 1), value: m.collected, value2: v.hasLastYear ? m.lastYear : undefined, future: m.future, current: m === current, title: m.future ? `${m.label}: still to come` : `${m.label}: ${cad(m.collected)} paid${v.hasLastYear ? ` (${lastYear}: ${cad(m.lastYear)})` : ''}` }))}
        />
        <details className="sb-fold">
          <summary>Numbers</summary>
          <div className="a-table-scroll">
            <table className="a-table">
              <caption className="sr-only">Signed and collected in {v.year}, month by month and as running totals</caption>
              <thead>
                <tr><th scope="col">Month</th><th scope="col" className="num">Collected</th>{v.hasLastYear ? <th scope="col" className="num">{lastYear}</th> : null}<th scope="col" className="num">Collected so far</th><th scope="col" className="num">Signed</th><th scope="col" className="num">Signed so far</th>{data.goals.signedYear ? <th scope="col" className="num">Even pace at month end</th> : null}</tr>
              </thead>
              <tbody>
                {v.months.map((m) => (
                  <tr key={m.label}>
                    <th scope="row">{m.label}</th>
                    <td className="num">{m.future ? DASH : cad(m.collected)}</td>
                    {v.hasLastYear ? <td className="num">{cad(m.lastYear)}</td> : null}
                    <td className="num">{m.future ? DASH : cad(m.collectedRun)}</td>
                    <td className="num">{m.future ? DASH : cad(m.signed)}</td>
                    <td className="num">{m.future ? DASH : cad(m.signedRun)}</td>
                    {m.pace !== undefined ? <td className="num">{cad(m.pace)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section id="owed" className="stack sb-gap-s" aria-labelledby="mn-owed-h">
        <h2 id="mn-owed-h" className="a-h2 a-h2-lg">Who owes</h2>
        {v.owed.rows.length ? (
          <div className="sb-card sb-list-card mn-showall mn-first-3">
            <ul className="sb-list mn-bill">
              {v.owed.rows.map((b) => {
                const word = STATUS_WORD[b.status] ?? { text: b.status, tone: 'muted' as ChipTone }
                const since = `${b.source === 'payment' ? 'Asked in the portal' : 'Zoho Books invoice made'} ${longDay(b.asked)}`
                return (
                  <li key={b.key} className="sb-row">
                    <Initials name={b.client} />
                    <span className="sb-row-main">
                      <strong>{b.client}</strong>
                      <span className="sb-row-sub">{b.project} · {b.label}</span>
                    </span>
                    <span className="sb-row-chips">
                      <AgeChip days={ageOf(b.asked)} label={since} />
                      {word.text !== 'Asked' && <Chip tone={word.tone} label={b.status}>{word.text}</Chip>}
                    </span>
                    <strong className="sb-row-amt">{cad(b.owed)}</strong>
                    <Link className="btn btn-secondary btn-sm sb-row-btn" href={moneyTab(b.projectId)}>Open<span className="sr-only"> the Money tab of {b.project}</span></Link>
                  </li>
                )
              })}
            </ul>
            <Toggle n={v.owed.rows.length} first={3} />
          </div>
        ) : (
          <p className="muted mn-empty">None</p>
        )}
      </section>

      <PhoneFold className="p-card" id="to-bill" folded labelledBy="mn-bill-h" summary={<><h2 id="mn-bill-h" className="a-h2">Still to bill</h2><span className="sb-fold-num">{v.toBill.counted ? cad(v.toBill.total) : DASH}</span></>}>
        {quotedWork.length > 1 && <SplitBar parts={billParts(sumOf((r) => r.paid), sumOf((r) => r.billedNotPaid), sumOf((r) => r.left ?? 0))} />}
        {v.toBill.rows.length ? (
          <BillList rows={v.toBill.rows} item={(r) => (
              <li key={r.projectId}>
                <span className="mn-bill-head">
                  <span><Link className="text-link" href={moneyTab(r.projectId)}>{r.project}<span className="sr-only">: open its Money tab</span></Link> <span className="small muted">{r.client}</span></span>
                  <strong className="mn-bill-left">{r.left === undefined ? DASH : `${cad(r.left)} left`}</strong>
                </span>
                {r.total !== undefined && r.left !== undefined ? (
                  <>
                    <SplitBar parts={billParts(r.paid, r.billedNotPaid, r.left)} legend={false} />
                    <span className="gx-caption" title={`Paid ${cad(r.paid)} · billed, not paid ${cad(r.billedNotPaid)} · left ${cad(r.left)}`}>of {cad(r.total)}</span>
                  </>
                ) : (
                  <span className="small muted">{r.reason}. Billed {cad(r.paid + r.billedNotPaid)}, paid {cad(r.paid)}.</span>
                )}
              </li>
          )} />
        ) : (
          <p className="muted small mn-empty">None</p>
        )}
      </PhoneFold>

      <PhoneFold className="p-card" id="paid" folded labelledBy="mn-paid-h" summary={<><h2 id="mn-paid-h" className="a-h2">Paid this year</h2><span className="sb-fold-num">{paidLine}</span></>}>
        {v.paidRows.length > 0 && <p className="m0"><a className="text-link" href="/api/admin/money/csv" download>Download CSV<span className="sr-only"> of the paid list</span></a></p>}
        {v.paidRows.length ? (
          <ShowAll rows={v.paidRows} head={<tr><th scope="col">Paid</th><th scope="col">Client</th><th scope="col">Project</th><th scope="col">What</th><th scope="col">How</th><th scope="col" className="num">Amount</th></tr>} row={(b) => (
                  <tr key={b.key}>
                    <td>{longDay(b.paidOn)}</td>
                    <td>{b.client}</td>
                    <td><Link className="text-link" href={moneyTab(b.projectId)}>{b.project}<span className="sr-only">: open its Money tab</span></Link></td>
                    <td>{b.label}</td>
                    <td>{b.source === 'payment' ? methodLabel(b.method) || DASH : 'Zoho Books invoice'}{b.cardFee ? <><br /><span className="small muted">plus {cad(b.cardFee)} card fee</span></> : null}</td>
                    <td className="num">{cad(b.amount)}</td>
                  </tr>
          )} />
        ) : (
          <p className="muted small mn-empty">None yet</p>
        )}
      </PhoneFold>

      {/* The year's running totals, how clients pay and the top clients: folded away, one click to open. */}
      <details className="p-card ap-details mn-breakdown">
        <summary><span>Year so far, how clients pay, top clients</span></summary>
        <div className="mn-grid">
          <section className="p-card sb-span-all" aria-labelledby="mn-year-h">
            <h3 id="mn-year-h" className="a-h2">The year so far</h3>
            <YearLines months={v.months} goal={data.goals.signedYear} yearGone={v.yearGone} format={cad} />
          </section>

          <section className="p-card" aria-labelledby="mn-how-h">
            <h3 id="mn-how-h" className="a-h2">How clients pay</h3>
            {v.methodRows.some((m) => m.amount > 0) ? (
              <Donut
                total={cad(v.methodRows.reduce((n, m) => n + m.amount, 0))}
                totalLabel="Paid"
                parts={v.methodRows.map((m) => ({ label: m.label.replace(/^(?!e-)./, (c) => c.toUpperCase()), value: m.amount, text: cad(m.amount), note: plural(m.count, 'payment') }))}
              />
            ) : (
              <p className="muted small mn-empty">None yet</p>
            )}
          </section>

          <section className="p-card" aria-labelledby="mn-top-h">
            <h3 id="mn-top-h" className="a-h2">Top clients</h3>
            <BarList rows={v.clientRows.map((c) => ({ label: c.label, value: c.amount, text: cad(c.amount), note: plural(c.count, 'payment') }))} empty="None yet" />
          </section>
        </div>
      </details>

      <HowWorkedOut
        notes={[
          'Amounts are CAD before GST. What’s owed is the balance to come in, GST included where charged.',
          'Each goal ring fills toward the goal. The copper tick marks an even pace to today: the goal times the share of the year (or month) gone. On the win rate it marks the goal.',
          'Zoho Books is the accounting record. Invoice statuses come from it; quote totals, stage moves and portal payments come from the back office.',
          'Due dates live in Zoho Books, so each owed line counts its age from the day it was asked for or the invoice was made. Draft invoices that haven’t been sent aren’t counted.',
          'Still to bill is each active project’s quote total (Onboarding to Final delivery), less what’s been invoiced.',
          ...(v.hasLastYear ? [] : ['Last year will sit beside this year once there are dated payments from it.']),
          'Only portal payments say how they were paid. Invoices paid straight in Zoho Books aren’t in the How clients pay split.',
          'An invoice with no portal payment is dated the day it was first seen paid in Zoho Books. Card fees are passed on to the client and aren’t in the amounts.',
        ]}
        gaps={v.gaps}
      />
    </>
  )
}

/**
 * A table showing its first three rows, with the rest behind "Show all" (one table, so the columns
 * line up; admin-pages.css hides the rest until the toggle is open).
 */
function ShowAll<T>({ rows, head, row }: { rows: T[]; head: React.ReactNode; row: (r: T) => React.ReactNode }) {
  return (
    <div className="mn-showall mn-first-3">
      <div className="a-table-scroll">
        <table className="a-table">
          <thead>{head}</thead>
          <tbody>{rows.map(row)}</tbody>
        </table>
      </div>
      <Toggle n={rows.length} first={3} />
    </div>
  )
}

/** The Still to bill list, the same way. */
function BillList<T>({ rows, item }: { rows: T[]; item: (r: T) => React.ReactNode }) {
  return (
    <div className="mn-showall mn-first-3">
      <ul className="mn-bill">{rows.map(item)}</ul>
      <Toggle n={rows.length} first={3} />
    </div>
  )
}

const Toggle = ({ n, first }: { n: number; first: number }) =>
  n > first ? (
    <details className="mn-showall-toggle">
      <summary><span className="mn-when-closed">Show all {n}</span><span className="mn-when-open">Show the first {first}</span></summary>
    </details>
  ) : null

/** Every method note on the page, behind one disclosure, with what the figures leave out. */
function HowWorkedOut({ notes, gaps }: { notes: string[]; gaps: ReturnType<typeof moneyView>['gaps'] }) {
  return (
    <details className="p-card ap-details sb-quiet">
      <summary>How these are worked out</summary>
      <ul className="ap-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
      <Gaps gaps={gaps} />
    </details>
  )
}

/** What the figures above leave out, and why. Shown only when something is missing. */
function Gaps({ gaps }: { gaps: ReturnType<typeof moneyView>['gaps'] }) {
  const lines = [
    gaps.signedNoDay && `${plural(gaps.signedNoDay, 'signed project')} with no stage history or signature to date ${gaps.signedNoDay === 1 ? 'it' : 'them'} (work from before the back office kept history). Counted in All time only.`,
    gaps.signedNoValue && `${plural(gaps.signedNoValue, 'signed project')} with no quote total (retainers are billed monthly). Counted as signed, with no dollar value.`,
    gaps.paidNoDay && `${plural(gaps.paidNoDay, 'paid invoice')} (${cad(gaps.paidNoDayAmount)}) with no recorded paid date. Counted in All time only.`,
    gaps.leadNoDay && `${plural(gaps.leadNoDay, 'project')} with no recorded start date. Counted in All time only.`,
    gaps.partlyPaid && `${plural(gaps.partlyPaid, 'part-paid invoice')}: the paid part isn’t on record separately, so it counts once the invoice is paid in full.`,
  ].filter(Boolean) as string[]
  if (!lines.length) return null
  return (
    <section aria-labelledby="mn-gaps-h" className="stack ap-gap-2">
      <h3 id="mn-gaps-h" className="tdx-sub">Not in these figures</h3>
      <ul className="small muted mn-gaps">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </section>
  )
}

/* ── Reports ────────────────────────────────────────────────────────── */

function ReportsView({ data, range }: { data: Data; range: RangeKey }) {
  const v = reportView(data.projects, data.payments, range)
  const rangeLabel = RANGES.find((r) => r.key === range)!.label
  const since = v.period.from ? `since ${longDay(v.period.from)}` : 'everything on record'
  const rate = (n: number | null) => (n === null ? DASH : `${n}%`)
  const mostDay = Math.max(...v.weekdays.map((x) => x.count), 0)
  return (
    <>
      <nav className="mn-range" aria-label="Time range" title={`${rangeLabel}: ${since}`}>
        {RANGES.map((r) => (
          <PendingLink key={r.key} href={`/admin/money?view=reports&range=${r.key}`} scroll={false} aria-current={r.key === range ? 'true' : undefined}>{r.label}</PendingLink>
        ))}
      </nav>

      <div className="a-kpis sb-tiles">
        <div className="a-kpi" title="Leads and projects first recorded in this range">
          <span className="a-kpi-label">New leads</span>
          <span className="a-kpi-num">{v.leads}</span>
        </div>
        <div className="a-kpi sb-tile-ring" title={v.win.decided ? `${v.win.signed} signed of ${v.win.decided} decided` : 'Nothing signed or declined in this range'}>
          <span className="a-kpi-label">Win rate</span>
          <span className="sb-tile-row">
            <GoalRing share={v.win.rate === null ? null : v.win.rate / 100} size={56} label={`Win rate ${rate(v.win.rate)}: ${v.win.decided ? `${v.win.signed} signed of ${v.win.decided} decided` : 'nothing decided'}`}>{rate(v.win.rate)}</GoalRing>
            {v.win.decided > 0 && <span className="sb-tile-sub" aria-hidden="true">{v.win.signed}/{v.win.decided}</span>}
          </span>
        </div>
        <div className="a-kpi" title={v.signed.count ? `${plural(v.signed.count, 'project')} reached Onboarding${v.signed.count > v.signed.withValue ? `, ${v.signed.count - v.signed.withValue} with no quote total` : ''}` : 'Nothing signed in this range'}>
          <span className="a-kpi-label">Signed</span>
          <span className="a-kpi-num">{v.signed.withValue ? cad(v.signed.value) : DASH}</span>
          {v.signed.count > 0 && <span className="sb-tile-sub">{plural(v.signed.count, 'project')}</span>}
        </div>
        <div className="a-kpi" title={v.signed.average === null ? 'No signed project with a quote total in this range' : `Across ${plural(v.signed.withValue, 'signed project')} with a quote total`}>
          <span className="a-kpi-label">Average project</span>
          <span className="a-kpi-num">{v.signed.average === null ? DASH : cad(v.signed.average)}</span>
        </div>
      </div>

      <section className="sb-card" aria-labelledby="mn-mbm-h">
        <h2 id="mn-mbm-h" className="a-h2">Money by {v.byYear ? 'year' : 'month'}</h2>
        {v.moneyByMonth.some((m) => m.signed > 0 || m.collected > 0) ? (
          <>
            <ColChart
              legend={['Signed', 'Collected']}
              label={`Signed and collected by ${v.byYear ? 'year' : 'month'}, before GST: ${v.moneyByMonth.map((m) => `${m.label} ${cad(m.signed)} signed, ${cad(m.collected)} collected`).join('; ')}.`}
              cols={v.moneyByMonth.map((m, i) => ({ label: m.label, short: v.byYear ? m.label : m.label.slice(0, 1), value: m.signed, value2: m.collected, current: i === v.moneyByMonth.length - 1, title: `${m.label}: ${cad(m.signed)} signed · ${cad(m.collected)} collected` }))}
            />
            <details className="sb-fold">
              <summary>Numbers</summary>
              <div className="a-table-scroll">
                <table className="a-table">
                  <caption className="sr-only">Signed and collected by {v.byYear ? 'year' : 'month'}, before GST</caption>
                  <thead><tr><th scope="col">{v.byYear ? 'Year' : 'Month'}</th><th scope="col" className="num">Signed</th><th scope="col" className="num">Collected</th></tr></thead>
                  <tbody>{v.moneyByMonth.map((m) => <tr key={m.label}><th scope="row">{m.label}</th><td className="num">{cad(m.signed)}</td><td className="num">{cad(m.collected)}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="muted small mn-empty">None in this range</p>
        )}
      </section>

      <div className="mn-grid">
        <PhoneFold className="p-card" labelledBy="mn-src-h" summary={<h2 id="mn-src-h" className="a-h2">Where leads come from</h2>}>
          {v.sources.length ? (
            <Donut
              total={String(v.leads)}
              totalLabel={v.leads === 1 ? 'Lead' : 'Leads'}
              parts={v.sources.map((s) => ({ label: s.label, value: s.leads, text: `${s.leads} · ${v.leads ? Math.round((s.leads / v.leads) * 100) : 0}%`, note: s.decided ? `${s.rate}% won (${s.signed}/${s.decided})` : 'None decided' }))}
            />
          ) : (
            <p className="muted small mn-empty">None in this range</p>
          )}
        </PhoneFold>

        <section className="p-card" aria-labelledby="mn-funnel-h">
          <h2 id="mn-funnel-h" className="a-h2">The funnel</h2>
          {v.leads ? (
            <ol className="gx-steps">
              {v.funnel.map((f) => (
                <li key={f.label} title={f.ofBefore === null ? 'Share of all leads' : 'Share of the step before'}>
                  <Ring value={f.ofBefore ?? f.ofAll} />
                  <span className="gx-step-num">{f.count}</span>
                  <span className="gx-step-label">{f.label}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small mn-empty">None in this range</p>
          )}
        </section>

        <PhoneFold className="p-card" labelledBy="mn-out-h" summary={<h2 id="mn-out-h" className="a-h2">What happened to them</h2>}>
          {v.leads ? (
            <SplitBar parts={v.outcomes.map((o) => ({ label: o.label, value: o.count, text: `${o.count} · ${Math.round((o.count / v.leads) * 100)}%` }))} />
          ) : (
            <p className="muted small mn-empty">None in this range</p>
          )}
        </PhoneFold>

        <section className="p-card" aria-labelledby="mn-day-h">
          <h2 id="mn-day-h" className="a-h2">Which day leads come in</h2>
          {v.weekdayCount ? (
            <ColChart
              height={96}
              label={`Leads by day of the week, Mountain time: ${v.weekdays.map((d) => `${d.label} ${d.count}`).join(', ')}.`}
              cols={v.weekdays.map((d) => ({ label: d.label, short: d.label.slice(0, 3), value: d.count, text: String(d.count), current: d.count === mostDay && mostDay > 0, title: `${d.label}: ${plural(d.count, 'lead')}` }))}
            />
          ) : (
            <p className="muted small mn-empty">None in this range</p>
          )}
        </section>

        <PhoneFold className="p-card" labelledBy="mn-type-h" summary={<h2 id="mn-type-h" className="a-h2">What people ask for</h2>}>
          <BarList rows={v.types.map((t) => ({ label: t.label, value: t.leads, text: plural(t.leads, 'lead'), note: `${t.signed} signed (${t.share}%)` }))} empty="None in this range" />
        </PhoneFold>

        <PhoneFold className="p-card" labelledBy="mn-pipe-h" summary={<h2 id="mn-pipe-h" className="a-h2">Open pipeline now</h2>}>
          {v.pipeline.some((s) => s.count > 0) ? (
            <MiniCols showValues cols={v.pipeline.map((s) => ({ label: s.label, value: s.count }))} />
          ) : (
            <p className="muted small mn-empty">None</p>
          )}
          <p className="m0"><Link className="text-link" href="/admin/pipeline">Open the pipeline</Link></p>
        </PhoneFold>
      </div>

      <HowWorkedOut
        notes={[
          'Amounts are CAD before GST. Days are Mountain time.',
          'The funnel uses stage history: a lead counts for a step when it reached that stage or a later one. “Had a call” is reaching Quote to write. Each ring is the share of the step before (the first, of all leads).',
          'Open pipeline now is today’s count in each sales stage, whatever range is picked.',
        ]}
        gaps={v.gaps}
      />
    </>
  )
}
