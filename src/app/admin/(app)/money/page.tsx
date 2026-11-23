import Link from 'next/link'
import { PendingLink } from '@/admin/ui/pending-link'
import '../../../css/admin-pages.css'
import '../../../css/admin-simple-a.css'
import '../../../css/admin-simple-b.css'
import { requireAdmin } from '@/admin/auth'
import { daysBetween, fmtDate, today } from '@/admin/dates'
import { cad } from '@/admin/insights'
import { moneyView, RANGES, reportView, type GoalLine, type RangeKey } from '@/admin/money'
import { loadMoney } from '@/admin/money-data'
import { GoalsForm } from '@/admin/ui/goals-form'
import { Legend, SplitBar } from '@/admin/ui/graphics'
import { HelpTip } from '@/admin/ui/help-tip'
import { BarList, DayBoxes, Meter, Outcomes, PartBars, ShareRing, Swatch, YearLines } from '@/admin/ui/money-charts'
import { YearCols } from '@/admin/ui/money-year'
import { AgeChip, Chip, ColChart, GoalRing, Initials, type ChipTone } from '@/admin/ui/viz'
import { methodLabel } from '@/portal/pay-methods'

export const metadata = { title: 'Money' }

type Props = { searchParams: Promise<{ view?: string | string[]; range?: string | string[] }> }

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
const DASH = '—'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const moneyTab = (projectId: string) => `/admin/projects/${encodeURIComponent(projectId)}?tab=money`
const longDay = (d?: string) => fmtDate(d) || DASH
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
/** Swatch tones for a list: five in turn, and the hollow one for "Not recorded". */
const toneOf = (label: string, i: number) => (label === 'Not recorded' ? 5 : i % 5)
const cap = (s: string) => s.replace(/^(?!e-)./, (c) => c.toUpperCase())

/** Money and Reports: what the back office's own records add up to. Zoho Books stays the accounting record. */
export default async function Money({ searchParams }: Props) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const view = one(sp.view) === 'reports' ? 'reports' : 'money'
  const range: RangeKey = RANGES.find((r) => r.key === one(sp.range))?.key ?? '12m'
  const data = await loadMoney()
  return (
    <div className="a-page mn sb-page mc-page">
      <div className="a-pending-scope stack sb-gap">
        <header className="sb-head">
          <div className="mc-title">
            <h1 className="a-h1">Money</h1>
            <nav className="pj-tabs" aria-label="Money views">
              <PendingLink href="/admin/money" aria-current={view === 'money' ? 'page' : undefined}>Money</PendingLink>
              <PendingLink href="/admin/money?view=reports" aria-current={view === 'reports' ? 'page' : undefined}>Reports</PendingLink>
            </nav>
          </div>
          {view === 'reports' && (
            <nav className="mn-range" aria-label="Time range">
              {RANGES.map((r) => (
                <PendingLink key={r.key} href={`/admin/money?view=reports&range=${r.key}`} scroll={false} aria-current={r.key === range ? 'true' : undefined}>{r.label}</PendingLink>
              ))}
            </nav>
          )}
        </header>
        <div className="a-pending-body stack sb-gap">
          {view === 'money' ? <MoneyView data={data} canEdit={!admin.viewOnly} /> : <ReportsView data={data} range={range} />}
        </div>
      </div>
    </div>
  )
}

type Data = Awaited<ReturnType<typeof loadMoney>>

/** A card's heading with one short data line under it. */
function Head({ id, title, sub, children }: { id: string; title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="sb-card-head">
      <div className="mc-head">
        <h2 id={id} className="a-h2">{title}</h2>
        {sub && <p className="mc-sub">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

/** A small card with one big number. */
function Stat({ label, value, sub, href, title }: { label: string; value: string; sub?: React.ReactNode; href?: string; title?: string }) {
  const body = (
    <>
      <span className="mc-stat-label">{label}</span>
      <strong className="mc-big">{value}</strong>
      {sub && <span className="mc-stat-sub">{sub}</span>}
    </>
  )
  return href ? <a className="sb-card mc-stat mc-stat-link" href={href} title={title}>{body}</a> : <div className="sb-card mc-stat" title={title}>{body}</div>
}

/* ── Money ──────────────────────────────────────────────────────────── */

const goalValue = (g: GoalLine) => (g.value === null ? DASH : g.unit === 'money' ? cad(g.value) : g.unit === 'rate' ? `${g.value}%` : String(g.value))
const goalOf = (g: GoalLine) => (!g.goal ? '' : g.unit === 'money' ? cad(g.goal) : g.unit === 'rate' ? `${g.goal}%` : String(g.goal))

/** "45% there · $45,089 behind pace", "250% there · Goal hit", or the gap in points for a rate. */
function goalStatus(g: GoalLine): React.ReactNode {
  if (g.value === null) return 'Nothing decided yet'
  if (!g.goal || g.gap === undefined || g.share === undefined) return 'No goal set'
  const there = `${Math.round(g.share * 100)}% there · `
  if (g.unit === 'rate') return <>{there}{g.value >= g.goal ? <strong className="mc-hit">At or above goal</strong> : <><strong>{plural(Math.round(g.goal - g.value), 'point')}</strong> under</>}</>
  if (g.value >= g.goal) return <>{there}<strong className="mc-hit">Goal hit</strong></>
  const size = g.unit === 'money' ? cad(Math.abs(g.gap)) : String(Math.round(Math.abs(g.gap)))
  const even = g.unit === 'money' ? Math.abs(g.gap) < 0.5 : Math.round(Math.abs(g.gap)) === 0
  return <>{there}{even ? 'on pace' : <><strong>{size}</strong> {g.gap < 0 ? 'behind' : 'ahead of'} pace</>}</>
}

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
  const current = v.months.filter((m) => !m.future).at(-1)
  const lastYear = String(Number(v.year) - 1)
  const billParts = (paid: number, billed: number, left: number) => [
    { label: 'Paid', value: paid, text: cad(paid), tone: 'accent' as const },
    { label: 'Billed, not paid', value: billed, text: cad(billed), tone: 'soft' as const },
    { label: 'Left to bill', value: left, text: cad(left), tone: 'dashed' as const },
  ]
  const paidTotal = v.paidRows.reduce((n, b) => n + b.amount, 0)
  const methodTotal = v.methodRows.reduce((n, m) => n + m.amount, 0)
  const methodCount = v.methodRows.reduce((n, m) => n + m.count, 0)
  const lastYearTotal = v.months.reduce((n, m) => n + m.lastYear, 0)
  const yearTotal = v.months.reduce((n, m) => n + m.collected, 0)

  return (
    <>
      <section className="stack sb-gap-s sb-goals" aria-labelledby="mn-goals-h">
        <div className="sb-card-head">
          <h2 id="mn-goals-h" className="mc-eyebrow">Goals for {v.year}</h2>
          {canEdit && <GoalsForm goals={data.goals} />}
        </div>
        <ul className="mc-goals">
          {v.goalLines.map((g) => {
            const set = Boolean(g.goal) && g.value !== null
            const tick = !set || g.unit === 'rate' ? undefined : g.paceShare
            return (
              <li key={g.key} className="sb-card mc-goal">
                <span className="mc-stat-label">{g.label}</span>
                <span className="mc-goal-val">
                  <strong className="mc-big">{goalValue(g)}</strong>
                  {g.goal ? <span className="mc-of">{g.unit === 'rate' ? 'goal' : 'of'} {goalOf(g)}</span> : null}
                </span>
                <Meter value={set ? g.share ?? 0 : 0} tick={tick} />
                <span className="mc-goal-line" title={g.note}>{goalStatus(g)}</span>
              </li>
            )
          })}
        </ul>
        <p className="mc-key-line">
          Tick = where an even pace puts you today
          <HelpTip label="About the goals">Each bar fills toward the goal. The tick is the goal times the share of the year (or month) gone, counting today. The win rate has no pace, so no tick.</HelpTip>
        </p>
      </section>

      <div className="mc-grid mc-grid-year">
        <section className="sb-card" aria-labelledby="mn-year-h">
          <Head id="mn-year-h" title="The year so far" sub={`Running totals${data.goals.signedYear ? ', against an even pace to the signed goal' : ''}`} />
          <YearLines months={v.months} goal={data.goals.signedYear} yearGone={v.yearGone} format={cad}>
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
          </YearLines>
        </section>
        <div className="mc-stats">
          <Stat label="Owed to you" value={cad(v.owed.total)} href="#owed" sub={`${plural(v.owed.rows.length, 'open invoice or payment', 'open invoices or payments')}${v.owed.clearing ? ` · ${v.owed.clearing} clearing` : ''}`} />
          <Stat label="Still to bill" value={v.toBill.counted ? cad(v.toBill.total) : DASH} href="#to-bill" sub={`On ${plural(v.toBill.rows.length, 'active project')}, not invoiced yet`} />
          <Stat label={`Collected in ${v.monthLabel}`} value={cad(v.collectedMonth.total)} href="#paid" sub={plural(v.collectedMonth.count, 'payment')} />
        </div>
      </div>

      <div className="mc-grid mc-grid-2">
        <section id="owed" className="sb-card" aria-labelledby="mn-owed-h">
          <Head id="mn-owed-h" title="Owed to you" sub={v.owed.rows.length ? `${cad(v.owed.total)} on ${plural(v.owed.rows.length, 'request')}` : undefined} />
          {v.owed.rows.length ? (
            <div className="mn-showall mn-first-3">
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
            <p className="mc-calm">Nothing owed right now. New invoices show up here as soon as they go out.</p>
          )}
        </section>

        <section id="to-bill" className="sb-card" aria-labelledby="mn-bill-h">
          <Head id="mn-bill-h" title="Still to bill" sub={v.toBill.counted ? `${cad(v.toBill.total)} not invoiced yet on ${plural(v.toBill.rows.length, 'active project')}` : undefined} />
          {v.toBill.rows.length ? (
            <>
              <Legend parts={billParts(0, 0, 0).map(({ label, tone }) => ({ label, value: 0, tone }))} />
              <div className="mn-showall mn-first-3">
                <ul className="mn-bill mc-bill">
                  {v.toBill.rows.map((r) => (
                    <li key={r.projectId}>
                      <span className="mc-bill-head">
                        <span><Link className="text-link" href={moneyTab(r.projectId)}>{r.project}<span className="sr-only">: open its Money tab</span></Link> <span className="muted">{r.client}</span></span>
                        {r.total !== undefined && <span className="muted mc-nowrap">of {cad(r.total)}</span>}
                      </span>
                      {r.total !== undefined && r.left !== undefined ? (
                        <>
                          <SplitBar parts={billParts(r.paid, r.billedNotPaid, r.left)} legend={false} />
                          <span className="mc-bill-foot" title={`Paid ${cad(r.paid)} · billed, not paid ${cad(r.billedNotPaid)} · left ${cad(r.left)}`}>
                            <strong>{cad(r.left)}</strong> left · {pctOf(r.paid + r.billedNotPaid, r.total)}% billed
                            <span className="sr-only">. Paid {cad(r.paid)}, billed but not paid {cad(r.billedNotPaid)}.</span>
                          </span>
                        </>
                      ) : (
                        <span className="mc-bill-foot">{r.reason}. Billed {cad(r.paid + r.billedNotPaid)}, paid {cad(r.paid)}.</span>
                      )}
                    </li>
                  ))}
                </ul>
                <Toggle n={v.toBill.rows.length} first={3} />
              </div>
            </>
          ) : (
            <p className="mc-calm">No active projects to bill.</p>
          )}
        </section>
      </div>

      <div className="mc-grid mc-grid-4">
        <section className="sb-card mc-span2" aria-labelledby="mn-months-h">
          <YearCols
            months={v.months.map((m) => ({ label: m.label, future: m.future, current: m === current }))}
            years={[
              { year: v.year, values: v.months.map((m) => m.collected), texts: v.months.map((m) => cad(m.collected)), total: cad(yearTotal) },
              ...(v.hasLastYear ? [{ year: lastYear, values: v.months.map((m) => m.lastYear), texts: v.months.map((m) => cad(m.lastYear)), total: cad(lastYearTotal) }] : []),
            ]}
          />
        </section>

        <section className="sb-card" aria-labelledby="mn-how-h">
          <Head id="mn-how-h" title="How clients pay" sub={methodCount ? `${plural(methodCount, 'portal payment')} in ${v.year}` : undefined}>
            <HelpTip label="About how clients pay">Only portal payments record how they were paid. Invoices paid straight in Zoho Books aren’t in this split.</HelpTip>
          </Head>
          {methodTotal > 0 ? (
            <div className="mc-pay">
              <ShareRing
                size={116}
                total={String(methodCount)}
                totalLabel={methodCount === 1 ? 'payment' : 'payments'}
                label={`How clients paid in ${v.year}, by number of payments: ${v.methodRows.map((m) => `${cap(m.label)} ${plural(m.count, 'payment')}, ${cad(m.amount)}`).join('; ')}.`}
                parts={v.methodRows.map((m, i) => ({ key: m.label, value: m.count, tone: toneOf(m.label, i) }))}
              />
              <ul className="mc-pay-list">
                {v.methodRows.map((m, i) => (
                  <li key={m.label}>
                    <span className="mc-pay-label"><Swatch i={toneOf(m.label, i)} />{cap(m.label)}</span>
                    <strong className="mc-nowrap">{cad(m.amount)}</strong>
                    <span className="mc-pct">{pctOf(m.amount, methodTotal)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mc-calm">No portal payments yet this year.</p>
          )}
        </section>

        <section className="sb-card" aria-labelledby="mn-top-h">
          <Head id="mn-top-h" title={`Top clients, ${v.year}`} sub={v.clientRows.length ? 'By what they paid' : undefined} />
          <BarList rows={v.clientRows.map((c) => ({ label: c.label, value: c.amount, text: cad(c.amount), tag: `${c.count}×` }))} empty="Nothing paid yet this year." />
        </section>
      </div>

      <section id="paid" className="sb-card" aria-labelledby="mn-paid-h">
        <Head id="mn-paid-h" title={`Paid in ${v.year}`} sub={v.paidRows.length ? `${cad(paidTotal)} from ${plural(v.paidRows.length, 'payment')}` : undefined}>
          {v.paidRows.length > 0 && <a className="btn btn-secondary btn-sm mc-csv" href="/api/admin/money/csv" download>Download CSV<span className="sr-only"> of the paid list</span></a>}
        </Head>
        {v.paidRows.length ? (
          <div className="mn-showall mc-first-6">
            <ul className="mc-paid">
              {v.paidRows.map((b) => {
                const how = b.source === 'payment' ? cap(methodLabel(b.method) || 'Method not recorded') : 'Zoho Books invoice'
                return (
                  <li key={b.key}>
                    <span className="mc-date" role="img" aria-label={longDay(b.paidOn)}>
                      <span aria-hidden="true">{b.paidOn ? MONTHS[Number(b.paidOn.slice(5, 7)) - 1] : DASH}</span>
                      <strong aria-hidden="true">{b.paidOn ? Number(b.paidOn.slice(8, 10)) : ''}</strong>
                    </span>
                    <span className="mc-paid-main">
                      <Link className="text-link" href={moneyTab(b.projectId)}>{b.project}<span className="sr-only">: open its Money tab</span></Link>
                      <span className="mc-paid-sub">{b.label} · {b.client} · {how}{b.cardFee ? ` · plus ${cad(b.cardFee)} card fee` : ''}</span>
                    </span>
                    <strong className="mc-paid-amt">{cad(b.amount)}</strong>
                  </li>
                )
              })}
            </ul>
            {v.paidRows.length > 6 && (
              <details className="mn-showall-toggle">
                <summary><span className="mn-when-closed">Show {v.paidRows.length - 6} more</span><span className="mn-when-open">Show fewer</span></summary>
              </details>
            )}
          </div>
        ) : (
          <p className="mc-calm">Nothing paid yet this year.</p>
        )}
      </section>

      <HowWorkedOut
        notes={[
          'Amounts are CAD before GST. What’s owed is the balance to come in, GST included where charged.',
          'Each goal bar fills toward the goal. The tick marks an even pace to today: the goal times the share of the year (or month) gone. The win rate has no pace.',
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

const IN_RANGE: Record<RangeKey, string> = { '30d': 'in the last 30 days', '12m': 'in the last 12 months', year: 'this year', all: 'on record' }

function ReportsView({ data, range }: { data: Data; range: RangeKey }) {
  const v = reportView(data.projects, data.payments, range)
  const inRange = IN_RANGE[range]
  const rate = (n: number | null) => (n === null ? DASH : `${n}%`)
  const busiest = v.weekdays.reduce((a, b) => (b.count > a.count ? b : a), v.weekdays[0])
  const signedAll = v.funnel.at(-1)?.ofAll ?? null
  const openLeads = v.pipeline.reduce((n, s) => n + s.count, 0)
  const leadGoal = data.goals.leadsMonth && !v.leadsByYear ? data.goals.leadsMonth : undefined
  const days = (n: number | null) => (n === null ? 'No data' : plural(n, 'day'))
  const none = <p className="mc-calm">No data yet {inRange}.</p>

  return (
    <>
      <div className="mc-grid mc-grid-4">
        <Stat label="New leads" value={String(v.leads)} sub={cap(inRange)} title="Leads and projects first recorded in this range" />
        <Stat
          label="Win rate"
          value={rate(v.win.rate)}
          sub={<>{v.win.decided ? `${v.win.signed} signed of ${v.win.decided} decided` : 'Nothing decided'}{data.goals.winRate ? <>. Goal <strong>{data.goals.winRate}%</strong></> : null}</>}
        />
        <Stat label="Signed" value={v.signed.withValue ? cad(v.signed.value) : DASH} sub={v.signed.count ? `${plural(v.signed.count, 'project')}, by month signed` : 'Nothing signed'} title={v.signed.count > v.signed.withValue ? `${v.signed.count - v.signed.withValue} with no quote total` : undefined} />
        <Stat label="Average project" value={v.signed.average === null ? DASH : cad(v.signed.average)} sub={v.signed.withValue ? `Across ${plural(v.signed.withValue, 'valued project')}` : 'No valued projects'} />
      </div>

      <div className="mc-grid mc-grid-4">
        <section className="sb-card mc-span2" aria-labelledby="mn-src-h">
          <Head id="mn-src-h" title="Where leads come from" sub={v.win.rate !== null ? `${v.win.rate}% win rate overall` : undefined} />
          {v.sources.length ? (
            <div className="mc-src">
              <ShareRing
                total={String(v.leads)}
                totalLabel={v.leads === 1 ? 'lead' : 'leads'}
                label={`Leads by source ${inRange}: ${v.sources.map((s) => `${s.label} ${s.leads}`).join(', ')}.`}
                parts={v.sources.map((s, i) => ({ key: s.label, value: s.leads, tone: toneOf(s.label, i) }))}
              />
              <div className="mc-src-scroll">
                <table className="mc-table">
                  <caption className="sr-only">Leads by source, share of leads and win rate</caption>
                  <thead className="sr-only"><tr><th scope="col">Source</th><th scope="col">Share</th><th scope="col">Win rate</th><th scope="col">Leads</th></tr></thead>
                  <tbody>
                    {v.sources.map((s, i) => (
                      <tr key={s.label}>
                        <th scope="row"><span className="mc-pay-label"><Swatch i={toneOf(s.label, i)} />{s.label}</span></th>
                        <td className="mc-share">
                          <span className="mc-track" aria-hidden="true"><span className="mc-fill" style={{ width: `${pctOf(s.leads, v.leads)}%` }} /></span>
                          <span className="mc-pct">{pctOf(s.leads, v.leads)}%</span>
                        </td>
                        <td className="mc-pct" title={s.decided ? `${s.signed} signed of ${s.decided} decided` : 'None decided'}>{s.rate === null ? '' : `${s.rate}% win`}</td>
                        <td className="num"><strong>{s.leads}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : none}
        </section>

        <section className="sb-card" aria-labelledby="mn-funnel-h">
          <Head id="mn-funnel-h" title="The funnel" sub={v.leads && signedAll !== null ? `${signedAll}% of new leads signed` : undefined}>
            <HelpTip label="About the funnel">A lead counts for a step when it reached that stage or a later one. “Had a call” is reaching Quote to write.</HelpTip>
          </Head>
          {v.leads ? (
            <ol className="mc-funnel">
              {v.funnel.map((f, i) => {
                const share = i === 0 ? 100 : f.ofBefore
                return (
                  <li key={f.label}>
                    <GoalRing share={share === null ? null : share / 100} size={56} label={`${f.label}: ${f.count}${i ? `, ${rate(f.ofBefore)} of the step before` : ''}`}>{rate(share)}</GoalRing>
                    <strong className="mc-funnel-num" aria-hidden="true">{f.count}</strong>
                    <span className="mc-funnel-label" aria-hidden="true">{f.label}</span>
                    <span className="mc-funnel-note" aria-hidden="true">{i ? `${rate(f.ofBefore)} of step before` : 'the start'}</span>
                  </li>
                )
              })}
            </ol>
          ) : none}
        </section>

        <section className="sb-card" aria-labelledby="mn-speed-h">
          <Head id="mn-speed-h" title="How fast deals sign" />
          <div className="mc-speed">
            <div className="mc-speed-row">
              <span className="mc-speed-label">Lead to signed</span>
              <strong className="mc-speed-num">{days(v.speed.contact.median)}</strong>
              <span className="mc-speed-sub">{v.speed.contact.count ? `Median of ${v.speed.contact.count} · avg ${plural(v.speed.contact.average ?? 0, 'day')}` : `No signings with a lead date ${inRange}`}</span>
            </div>
            <div className="mc-speed-row">
              <span className="mc-speed-label">Quote to signed</span>
              <strong className="mc-speed-num">{days(v.speed.quote.median)}</strong>
              <span className="mc-speed-sub">{v.speed.quote.count ? `Median of ${v.speed.quote.count} · avg ${plural(v.speed.quote.average ?? 0, 'day')}` : `No signings with a Quoted date ${inRange}`}</span>
            </div>
            <div className="mc-speed-row mc-speed-types">
              <span className="mc-speed-label">Average value by type</span>
              <BarList rows={v.speed.byType.map((x) => ({ label: x.label, value: x.average, text: cad(x.average), tag: `· ${x.count}` }))} empty={`No valued signings ${inRange}.`} />
            </div>
          </div>
        </section>
      </div>

      <div className="mc-grid mc-grid-4">
        <section className="sb-card mc-span2" aria-labelledby="mn-mbm-h">
          <Head id="mn-mbm-h" title={`Money by ${v.byYear ? 'year' : 'month'}`} sub={`${cad(v.signed.value)} signed · ${cad(v.collected)} collected`} />
          {v.moneyByMonth.some((m) => m.signed > 0 || m.collected > 0) ? (
            <>
              <ColChart
                legend={['Signed', 'Collected']}
                label={`Signed and collected by ${v.byYear ? 'year' : 'month'}, before GST: ${v.moneyByMonth.map((m) => `${m.label} ${cad(m.signed)} signed, ${cad(m.collected)} collected`).join('; ')}.`}
                cols={v.moneyByMonth.map((m) => ({ label: m.label, short: v.byYear ? m.label : m.label.slice(0, 3), value: m.signed, value2: m.collected, title: `${m.label}: ${cad(m.signed)} signed · ${cad(m.collected)} collected` }))}
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
          ) : none}
        </section>

        <section className="sb-card" aria-labelledby="mn-lbm-h">
          <Head id="mn-lbm-h" title={`New leads by ${v.leadsByYear ? 'year' : 'month'}`} sub={leadGoal ? `Goal ${leadGoal} a month · copper hit it` : `${plural(v.leads, 'lead')} ${inRange}`} />
          {v.leads ? (
            <ColChart
              height={130}
              goal={leadGoal ? { value: leadGoal, text: `Goal ${leadGoal}` } : undefined}
              label={`New leads by ${v.leadsByYear ? 'year' : 'month'}: ${v.leadsByMonth.map((m) => `${m.label} ${m.count}`).join(', ')}${leadGoal ? `. Goal ${leadGoal} a month; ${v.leadsByMonth.filter((m) => m.count >= leadGoal).length} of ${v.leadsByMonth.length} hit it` : ''}.`}
              cols={v.leadsByMonth.map((m) => ({ label: m.label, short: v.leadsByYear ? m.label : m.label.slice(0, 3), value: m.count, text: String(m.count), title: `${m.label}: ${plural(m.count, 'lead')}` }))}
            />
          ) : none}
        </section>

        <section className="sb-card" aria-labelledby="mn-out-h">
          <Head id="mn-out-h" title="What happened to them" sub={v.leads ? `${plural(v.leads, 'lead')} ${inRange}` : undefined} />
          {v.leads ? <Outcomes parts={v.outcomes} total={v.leads} /> : none}
        </section>
      </div>

      <div className="mc-grid mc-grid-4">
        <section className="sb-card" aria-labelledby="mn-day-h">
          <Head id="mn-day-h" title="Which day leads come in" sub={v.weekdayCount && busiest.count ? `Busiest: ${busiest.label}s` : undefined} />
          {v.weekdayCount ? (
            <DayBoxes label={`Leads by day of the week, Mountain time: ${v.weekdays.map((d) => `${d.label} ${d.count}`).join(', ')}.`} days={v.weekdays.map((d) => ({ label: d.label, short: d.label.slice(0, 3), count: d.count }))} />
          ) : none}
        </section>

        <section className="sb-card mc-span2" aria-labelledby="mn-type-h">
          <Head id="mn-type-h" title="What people ask for" sub={v.types.length ? 'Leads by project type · copper = signed' : undefined} />
          <PartBars rows={v.types.map((x) => ({ label: x.label, total: x.leads, part: x.signed, text: String(x.leads), partText: x.signed ? `${x.signed} signed` : undefined }))} empty={`No data yet ${inRange}.`} />
        </section>

        <section className="sb-card" aria-labelledby="mn-pipe-h">
          <Head id="mn-pipe-h" title="Open pipeline right now" sub={`${plural(openLeads, 'lead')} in play`}>
            <Link className="text-link mc-more" href="/admin/pipeline">Pipeline</Link>
          </Head>
          {openLeads ? (
            <ColChart
              height={110}
              wrap
              label={`Open leads by stage today: ${v.pipeline.map((s) => `${s.label} ${s.count}`).join(', ')}.`}
              cols={v.pipeline.map((s) => ({ label: s.label, value: s.count, text: String(s.count), title: `${s.label}: ${plural(s.count, 'lead')}` }))}
            />
          ) : (
            <p className="mc-calm">No open leads right now.</p>
          )}
        </section>
      </div>

      <HowWorkedOut
        notes={[
          'Amounts are CAD before GST. Days are Mountain time.',
          'The figures follow the leads that came in during the range. Signed, win rate and money by month count what was signed or paid in the range.',
          'The funnel uses stage history: a lead counts for a step when it reached that stage or a later one. “Had a call” is reaching Quote to write. Each ring is the share of the step before.',
          'How fast deals sign counts days from the lead’s first record (and from its first move to Quoted) to its first move to Onboarding or its signature. Only projects with both dates count.',
          'Open pipeline right now is today’s count in each sales stage, whatever range is picked.',
        ]}
        gaps={v.gaps}
      />
    </>
  )
}
