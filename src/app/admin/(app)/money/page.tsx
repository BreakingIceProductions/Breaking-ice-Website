import Link from 'next/link'
import { PendingLink } from '@/admin/ui/pending-link'
import '../../../css/admin-pages.css'
import { requireAdmin } from '@/admin/auth'
import { fmtDate } from '@/admin/dates'
import { cad } from '@/admin/insights'
import { moneyView, RANGES, reportView, type GoalLine, type RangeKey } from '@/admin/money'
import { loadMoney } from '@/admin/money-data'
import { GoalsForm } from '@/admin/ui/goals-form'
import { Bar, DayStrip, Donut, MiniCols, Ring, SplitBar } from '@/admin/ui/graphics'
import { BarList, PairBars, YearLines } from '@/admin/ui/money-charts'
import { methodLabel } from '@/portal/pay-methods'
import { PhoneFold } from '../_fold'

export const metadata = { title: 'Money' }

type Props = { searchParams: Promise<{ view?: string | string[]; range?: string | string[] }> }

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
const DASH = '—'
const moneyTab = (projectId: string) => `/admin/projects/${encodeURIComponent(projectId)}?tab=money`
const longDay = (d?: string) => fmtDate(d) || DASH

/** Money and Reports: what the back office's own records add up to. Zoho Books stays the accounting record. */
export default async function Money({ searchParams }: Props) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const view = one(sp.view) === 'reports' ? 'reports' : 'money'
  const range: RangeKey = RANGES.find((r) => r.key === one(sp.range))?.key ?? '12m'
  const data = await loadMoney()
  return (
    <div className={`a-page mn${view === 'money' ? ' mn-money' : ''}`}>
      <header className="a-head">
        <div className="stack ap-gap-3">
          <h1 className="a-h1">Money</h1>
          <p className="muted m0 ap-measure">Signed, billed and collected. CAD before GST unless marked.</p>
        </div>
      </header>

      <div className="a-pending-scope">
        <nav className="pj-tabs" aria-label="Money views">
          <PendingLink href="/admin/money" aria-current={view === 'money' ? 'page' : undefined}>Money</PendingLink>
          <PendingLink href="/admin/money?view=reports" aria-current={view === 'reports' ? 'page' : undefined}>Reports</PendingLink>
        </nav>
        <div className="a-pending-body">
          {view === 'money' ? <MoneyView data={data} canEdit={!admin.viewOnly} /> : <ReportsView data={data} range={range} />}
        </div>
      </div>
    </div>
  )
}

type Data = Awaited<ReturnType<typeof loadMoney>>

/* ── Money ──────────────────────────────────────────────────────────── */

const goalValue = (g: GoalLine) => (g.value === null ? DASH : g.unit === 'money' ? cad(g.value) : g.unit === 'rate' ? `${g.value}%` : String(g.value))
const goalTarget = (g: GoalLine) => (g.goal ? `of ${g.unit === 'money' ? cad(g.goal) : g.unit === 'rate' ? `a ${g.goal}%` : g.goal} goal` : 'No goal set')

/** "78% there · $12,000 behind pace", or the gap to the goal itself for a rate. */
function goalProgress(g: GoalLine) {
  if (g.value === null) return 'Nothing decided yet, so no rate'
  if (!g.goal || g.gap === undefined || g.share === undefined) return ''
  if (g.unit === 'rate') return g.gap === 0 ? 'On the goal' : `${plural(Math.abs(g.gap), 'point')} ${g.gap < 0 ? 'under' : 'over'} the goal`
  const size = g.unit === 'money' ? cad(Math.abs(g.gap)) : String(Math.round(Math.abs(g.gap)))
  const even = g.unit === 'money' ? Math.abs(g.gap) < 0.5 : Math.round(Math.abs(g.gap)) === 0
  return `${Math.round(g.share * 100)}% there · ${even ? 'on pace' : `${size} ${g.gap < 0 ? 'behind' : 'ahead of'} pace`}`
}

function MoneyView({ data, canEdit }: { data: Data; canEdit: boolean }) {
  const v = moneyView(data.projects, data.payments, data.goals)
  const shown = v.months.filter((m) => !m.future)
  // Pictures for the tiles: the last six months collected, and every quoted project's total in its three parts.
  const sixMonths = reportView(data.projects, data.payments, '12m').moneyByMonth.slice(-6)
  const quotedWork = v.toBill.rows.filter((r) => r.total !== undefined && r.left !== undefined)
  const billParts = (paid: number, billed: number, left: number) => [
    { label: 'Paid', value: paid, text: cad(paid), tone: 'accent' as const },
    { label: 'Billed, not paid', value: billed, text: cad(billed), tone: 'soft' as const },
    { label: 'Left to bill', value: left, text: cad(left), tone: 'dashed' as const },
  ]
  const sumOf = (pick: (r: (typeof quotedWork)[number]) => number) => quotedWork.reduce((n, r) => n + pick(r), 0)
  // The total of this year's paid list, for the folded sections' summary lines.
  const paidTotal = v.paidRows.reduce((n, b) => n + b.amount, 0)
  const paidLine = v.paidRows.length ? `${cad(paidTotal)} from ${plural(v.paidRows.length, 'payment')}` : 'Nothing recorded as paid yet'
  return (
    <>
      <section aria-labelledby="mn-goals-h" className="stack mn-section">
        <h2 id="mn-goals-h" className="a-h2">Goals for {v.year}</h2>
        <div className="a-kpis mn-goals">
          {v.goalLines.map((g) => (
            <div className="a-kpi" key={g.key}>
              <span className="a-kpi-label">{g.label}</span>
              <span className="a-kpi-num">{goalValue(g)}</span>
              <span className="mn-goal-target">{goalTarget(g)}</span>
              {g.goal && g.value !== null ? (
                g.unit === 'rate' ? <Bar value={g.value / 100} tick={g.goal / 100} /> : <Bar value={g.share ?? 0} tick={g.paceShare} />
              ) : null}
              {goalProgress(g) && <span className="mn-goal-progress">{goalProgress(g)}</span>}
              <span className="a-kpi-note">{g.note}</span>
            </div>
          ))}
        </div>
        {canEdit && <GoalsForm goals={data.goals} />}
      </section>

      <PhoneFold className="p-card" labelledBy="mn-year-h" summary={<><h2 id="mn-year-h" className="a-h2">The year so far</h2><span className="muted small ap-fold-note">Running totals, before GST</span></>}>
        <YearLines months={v.months} goal={data.goals.signedYear} yearGone={v.yearGone} format={cad}>
          <details className="mn-table-alt">
            <summary>Show these numbers as a table</summary>
            <div className="a-table-scroll">
              <table className="a-table">
                <caption className="sr-only">Signed and collected in {v.year}, month by month and as running totals</caption>
                <thead>
                  <tr><th scope="col">Month</th><th scope="col" className="num">Signed</th><th scope="col" className="num">Signed so far</th><th scope="col" className="num">Collected</th><th scope="col" className="num">Collected so far</th>{data.goals.signedYear ? <th scope="col" className="num">Even pace at month end</th> : null}</tr>
                </thead>
                <tbody>
                  {v.months.map((m) => (
                    <tr key={m.label}>
                      <th scope="row">{m.label}</th>
                      <td className="num">{m.future ? DASH : cad(m.signed)}</td>
                      <td className="num">{m.future ? DASH : cad(m.signedRun)}</td>
                      <td className="num">{m.future ? DASH : cad(m.collected)}</td>
                      <td className="num">{m.future ? DASH : cad(m.collectedRun)}</td>
                      {m.pace !== undefined ? <td className="num">{cad(m.pace)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </YearLines>
      </PhoneFold>

      <div className="a-kpis">
        <a href="#owed" className={`a-kpi td-tile${v.owed.total ? ' is-hot' : ''}`}>
          <span className="a-kpi-label">Owed to you</span>
          <span className="a-kpi-num">{cad(v.owed.total)}</span>
          <span className="a-kpi-note">{plural(v.owed.rows.length, 'open invoice or payment', 'open invoices and payments')}{v.owed.clearing ? `, ${v.owed.clearing} clearing` : ''}. GST included where charged.</span>
        </a>
        <a href="#to-bill" className="a-kpi td-tile">
          <span className="a-kpi-label">Still to bill</span>
          <span className="a-kpi-num">{v.toBill.counted ? cad(v.toBill.total) : DASH}</span>
          <span className="a-kpi-note">{v.toBill.counted ? `Quote totals less what’s been invoiced, on ${plural(v.toBill.counted, 'active project')}` : 'No active project has a quote total on record'}{v.toBill.rows.length > v.toBill.counted ? `. ${v.toBill.rows.length - v.toBill.counted} more with no quote total.` : ''}</span>
          {quotedWork.length > 0 && <SplitBar parts={billParts(sumOf((r) => r.paid), sumOf((r) => r.billedNotPaid), sumOf((r) => r.left ?? 0))} />}
        </a>
        <a href="#paid" className="a-kpi td-tile">
          <span className="a-kpi-label">Collected in {v.monthLabel}</span>
          <span className="a-kpi-num">{cad(v.collectedMonth.total)}</span>
          <span className="a-kpi-note">{plural(v.collectedMonth.count, 'payment')} recorded as paid this month</span>
          <span className="gx-wrap" role="img" aria-label={`Collected in the last six months: ${sixMonths.map((m) => `${m.label} ${cad(m.collected)}`).join(', ')}.`}>
            <MiniCols cols={sixMonths.map((m, i) => ({ label: m.label.slice(0, 1), value: m.collected, current: i === sixMonths.length - 1 }))} />
          </span>
        </a>
      </div>

      {/* Owed and Still to bill side by side on a wide screen: what's coming in, and what's still to ask for. */}
      <div className="mn-pair">
      <section className="p-card" id="owed" aria-labelledby="mn-owed-h">
        <div className="a-card-head">
          <h2 id="mn-owed-h" className="a-h2">Owed to you</h2>
          <span className="muted small">Balance to come in, GST included where charged</span>
        </div>
        {v.owed.rows.length ? (
          <ShowAll rows={v.owed.rows} head={<tr><th scope="col">What</th><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Since</th><th scope="col" className="num">Owed</th></tr>} row={(b) => (
                  <tr key={b.key}>
                    <td>{b.label}<br /><span className="small muted">{b.source === 'payment' ? 'Portal payment' : 'Zoho Books invoice'}</span></td>
                    <td><Link className="text-link" href={moneyTab(b.projectId)}>{b.project}<span className="sr-only">: open its Money tab</span></Link><br /><span className="small muted">{b.client}</span></td>
                    <td>{b.status}</td>
                    <td>{b.source === 'payment' ? 'Asked' : 'Invoice made'} {longDay(b.asked)}</td>
                    <td className="num">{cad(b.owed)}</td>
                  </tr>
          )} />
        ) : (
          <p className="muted small mn-empty">Nothing is owed right now.</p>
        )}
      </section>

      <PhoneFold className="p-card" id="to-bill" labelledBy="mn-bill-h" summary={<><h2 id="mn-bill-h" className="a-h2">Still to bill</h2><span className="muted small ap-fold-note">Active projects, Onboarding to Final delivery</span></>}>
        {v.toBill.rows.length ? (
          <BillList rows={v.toBill.rows} item={(r) => (
              <li key={r.projectId}>
                <span className="mn-bill-head">
                  <span><Link className="text-link" href={moneyTab(r.projectId)}>{r.project}<span className="sr-only">: open its Money tab</span></Link> <span className="small muted">{r.client}</span></span>
                  <strong className="mn-bill-left">{r.left === undefined ? DASH : `${cad(r.left)} left`}</strong>
                </span>
                {r.total !== undefined && r.left !== undefined ? (
                  <>
                    <SplitBar parts={billParts(r.paid, r.billedNotPaid, r.left)} />
                    <span className="gx-caption">Quote total {cad(r.total)}</span>
                  </>
                ) : (
                  <span className="small muted">{r.reason}. Billed so far: {cad(r.paid + r.billedNotPaid)}, of which {cad(r.paid)} paid.</span>
                )}
              </li>
          )} />
        ) : (
          <p className="muted small mn-empty">No active projects right now.</p>
        )}
      </PhoneFold>

      </div>

      {/* The breakdowns behind "Collected": folded away, one click to open. */}
      <details className="p-card ap-details mn-breakdown">
        <summary><span>By month, by payment method and by client</span> <span className="mn-sum-note">{paidLine} in {v.year}</span></summary>
      <div className="mn-grid">
        <section className="p-card" aria-labelledby="mn-months-h">
          <div className="a-card-head">
            <h3 id="mn-months-h" className="a-h2">Collected by month</h3>
            <span className="muted small">{v.hasLastYear ? `${v.year} beside ${Number(v.year) - 1}` : v.year}</span>
          </div>
          {v.hasLastYear ? (
            <PairBars rows={v.months.map((m) => ({ label: m.label, a: m.future ? 0 : m.collected, b: m.lastYear, aText: m.future ? 'Not yet' : undefined }))} a={v.year} b={String(Number(v.year) - 1)} format={cad} empty="Nothing recorded as paid yet." />
          ) : (
            <BarList rows={shown.map((m) => ({ label: m.label, value: m.collected, text: cad(m.collected) }))} empty="Nothing recorded as paid yet this year." />
          )}
        </section>

        <section className="p-card" aria-labelledby="mn-how-h">
          <div className="a-card-head">
            <h3 id="mn-how-h" className="a-h2">How clients pay</h3>
            <span className="muted small">Portal payments, {v.year}</span>
          </div>
          {v.methodRows.some((m) => m.amount > 0) ? (
            <Donut
              total={cad(v.methodRows.reduce((n, m) => n + m.amount, 0))}
              totalLabel="Paid"
              parts={v.methodRows.map((m) => ({ label: m.label.replace(/^(?!e-)./, (c) => c.toUpperCase()), value: m.amount, text: cad(m.amount), note: plural(m.count, 'payment') }))}
            />
          ) : (
            <p className="muted small mn-empty">No portal payments recorded as paid this year.</p>
          )}
        </section>

        <section className="p-card" aria-labelledby="mn-top-h">
          <div className="a-card-head">
            <h3 id="mn-top-h" className="a-h2">Top clients this year</h3>
            <span className="muted small">By what they paid</span>
          </div>
          <BarList rows={v.clientRows.map((c) => ({ label: c.label, value: c.amount, text: cad(c.amount), note: plural(c.count, 'payment') }))} empty="Nothing recorded as paid yet this year." />
        </section>
      </div>
      </details>

      <PhoneFold className="p-card" id="paid" folded labelledBy="mn-paid-h" summary={<><h2 id="mn-paid-h" className="a-h2">Paid this year</h2><span className="muted small ap-fold-note">{paidLine}</span></>}>
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
          <p className="muted small mn-empty">Nothing recorded as paid yet this year.</p>
        )}
      </PhoneFold>

      <HowWorkedOut
        notes={[
          'The tick on each goal bar marks an even pace to today: the goal times the share of the year (or month) gone. On the win rate it marks the goal.',
          'Zoho Books is the accounting record. Invoice statuses come from it; quote totals, stage moves and portal payments come from the back office.',
          'Due dates live in Zoho Books, so each owed line shows the day it was asked for or the invoice was made. Draft invoices that haven’t been sent aren’t counted.',
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
    <details className="p-card ap-details">
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
  return (
    <>
      <div className="mn-range-row">
        <nav className="mn-range" aria-label="Time range">
          {RANGES.map((r) => (
            <PendingLink key={r.key} href={`/admin/money?view=reports&range=${r.key}`} scroll={false} aria-current={r.key === range ? 'true' : undefined}>{r.label}</PendingLink>
          ))}
        </nav>
        <span className="small muted">{rangeLabel}: {since}</span>
      </div>

      <div className="a-kpis">
        <div className="a-kpi">
          <span className="a-kpi-label">New leads</span>
          <span className="a-kpi-num">{v.leads}</span>
          <span className="a-kpi-note">Leads and projects first recorded in this range</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Win rate</span>
          <span className="a-kpi-num">{rate(v.win.rate)}</span>
          <span className="a-kpi-note">{v.win.decided ? `${v.win.signed} signed of ${v.win.decided} decided` : 'Nothing signed or declined in this range'}</span>
          {v.win.decided > 0 && <SplitBar parts={[{ label: 'Signed', value: v.win.signed, text: String(v.win.signed), tone: 'accent' }, { label: 'Declined', value: v.win.decided - v.win.signed, text: String(v.win.decided - v.win.signed), tone: 'soft' }]} />}
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Signed</span>
          <span className="a-kpi-num">{v.signed.withValue ? cad(v.signed.value) : DASH}</span>
          <span className="a-kpi-note">{v.signed.count ? `${plural(v.signed.count, 'project')} reached Onboarding${v.signed.count > v.signed.withValue ? `, ${v.signed.count - v.signed.withValue} with no quote total` : ''}` : 'Nothing signed in this range'}</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Average project</span>
          <span className="a-kpi-num">{v.signed.average === null ? DASH : cad(v.signed.average)}</span>
          <span className="a-kpi-note">{v.signed.average === null ? 'No signed project with a quote total in this range' : `Across ${plural(v.signed.withValue, 'signed project')} with a quote total`}</span>
        </div>
      </div>

      <div className="mn-grid">
        <section className="p-card" aria-labelledby="mn-src-h">
          <div className="a-card-head">
            <h2 id="mn-src-h" className="a-h2">Where leads come from</h2>
            <span className="muted small">Leads, with the win rate for each</span>
          </div>
          {v.sources.length ? (
            <Donut
              total={String(v.leads)}
              totalLabel={v.leads === 1 ? 'Lead' : 'Leads'}
              parts={v.sources.map((s) => ({ label: s.label, value: s.leads, text: `${s.leads} · ${v.leads ? Math.round((s.leads / v.leads) * 100) : 0}%`, note: s.decided ? `${s.rate}% won: ${s.signed} signed of ${s.decided} decided` : 'None decided yet' }))}
            />
          ) : (
            <p className="muted small mn-empty">No leads in this range.</p>
          )}
        </section>

        <section className="p-card" aria-labelledby="mn-funnel-h">
          <div className="a-card-head">
            <h2 id="mn-funnel-h" className="a-h2">The funnel</h2>
            <span className="muted small">Leads from this range, by how far they got</span>
          </div>
          {v.leads ? (
            <ol className="gx-steps">
              {v.funnel.map((f) => (
                <li key={f.label}>
                  <Ring value={f.ofBefore ?? f.ofAll} />
                  <span className="gx-step-num">{f.count}</span>
                  <span className="gx-step-label">{f.label}</span>
                  <span className="gx-step-note">{f.ofBefore === null ? 'of all leads' : 'of the step before'}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small mn-empty">No leads in this range.</p>
          )}
        </section>

        <PhoneFold className="p-card" labelledBy="mn-mbm-h" summary={<><h2 id="mn-mbm-h" className="a-h2">Money by {v.byYear ? 'year' : 'month'}</h2><span className="muted small ap-fold-note">Before GST</span></>}>
          <PairBars rows={v.moneyByMonth.map((m) => ({ label: m.label, a: m.signed, b: m.collected }))} a="Signed" b="Collected" format={cad} empty="Nothing signed or collected with a date in this range." />
        </PhoneFold>

        <section className="p-card" aria-labelledby="mn-out-h">
          <div className="a-card-head">
            <h2 id="mn-out-h" className="a-h2">What happened to them</h2>
            <span className="muted small">Leads from this range</span>
          </div>
          {v.leads ? (
            <SplitBar parts={v.outcomes.map((o) => ({ label: o.label, value: o.count, text: `${o.count} · ${Math.round((o.count / v.leads) * 100)}%` }))} />
          ) : (
            <p className="muted small mn-empty">No leads in this range.</p>
          )}
        </section>

        <PhoneFold className="p-card" labelledBy="mn-day-h" summary={<><h2 id="mn-day-h" className="a-h2">Which day leads come in</h2><span className="muted small ap-fold-note">Mountain time</span></>}>
          {v.weekdayCount ? (
            <DayStrip label="Leads by day of the week" cells={v.weekdays.map((d) => ({ key: d.label, label: d.label.slice(0, 3), value: <>{d.count}<span className="sr-only"> on {d.label}s</span></>, level: d.count / Math.max(...v.weekdays.map((x) => x.count), 1) }))} />
          ) : (
            <p className="muted small mn-empty">No dated leads in this range.</p>
          )}
        </PhoneFold>

        <PhoneFold className="p-card" labelledBy="mn-type-h" summary={<><h2 id="mn-type-h" className="a-h2">What people ask for</h2><span className="muted small ap-fold-note">Project type, with the share that signed</span></>}>
          <BarList rows={v.types.map((t) => ({ label: t.label, value: t.leads, text: plural(t.leads, 'lead'), note: `${t.signed} signed (${t.share}%)` }))} empty="No leads in this range." />
        </PhoneFold>

        <PhoneFold className="p-card" labelledBy="mn-pipe-h" summary={<h2 id="mn-pipe-h" className="a-h2">Open pipeline right now</h2>}>
          <p className="m0"><Link className="text-link" href="/admin/pipeline">Open the pipeline</Link></p>
          {v.pipeline.some((s) => s.count > 0) ? (
            <MiniCols showValues cols={v.pipeline.map((s) => ({ label: s.label, value: s.count }))} />
          ) : (
            <p className="muted small mn-empty">Nobody in the sales stages right now.</p>
          )}
        </PhoneFold>
      </div>

      <HowWorkedOut
        notes={[
          'The funnel uses stage history: a lead counts for a step when it reached that stage or a later one. “Had a call” is reaching Quote to write.',
          'Open pipeline right now is today’s count in each sales stage, whatever range is picked.',
        ]}
        gaps={v.gaps}
      />
    </>
  )
}
