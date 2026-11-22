import Link from 'next/link'
import '../../css/admin-pages.css'
import { requireAdmin } from '@/admin/auth'
import { listSuggestions } from '@/admin/capture'
import { nextTwoWeeks, pipelineTiles, quoteStatus } from '@/admin/board-data'
import { TZ, addDays, fmtDay, relDays, today, weekday, ymd, fmtDate } from '@/admin/dates'
import { cad, needsAction, waitingOnClients, type Row } from '@/admin/insights'
import { fmtTime, isSalesStage, pageHref } from '@/admin/lead'
import { MILESTONE_LIST } from '@/admin/milestones'
import { moneyView, reportView, signing } from '@/admin/money'
import { depositsDue, followUps } from '@/admin/needs-you'
import { loadMoney } from '@/admin/money-data'
import { signCounts } from '@/admin/sign-rows'
import { stageIndex } from '@/admin/stages'
import type { OfficeProject } from '@/admin/types'
import { DismissableRow, DismissCount } from '@/admin/ui/dismissable-row'
import { LeadSuggestions } from '@/admin/ui/lead-suggestions'
import { Bar, DayStrip, MiniCols, SplitBar } from '@/admin/ui/graphics'
import { TodayTasks } from '@/admin/ui/today-tasks'
import { portalEnv } from '@/portal/config'
import { listRequests } from '@/portal/sign-store'

export const metadata = { title: 'Today' }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const projectTab = (id: string, tab: string) => `/admin/projects/${encodeURIComponent(id)}?tab=${tab}`

/** A first name without a fetch: the name set beside this same address in PORTAL_FROM ("Name, Company <address>"). Anyone else gets none. */
function firstNameFor(email: string) {
  const m = /^\s*([^<,]+?)\s*(?:,[^<]*)?<\s*([^>\s]+)\s*>/.exec(portalEnv.from)
  return m && m[2].toLowerCase() === email.trim().toLowerCase() ? m[1].split(/\s+/)[0] : undefined
}

const hello = () => {
  const h = Number(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/* ── What the page works out. Pure: everything comes from the one money load. ── */

type Dated = { date: string; time?: string; what: string; kind: 'shoot' | 'travel' | 'meeting' | 'other' | 'milestone' | 'call'; project: OfficeProject; /** For a milestone: the reminder key Needs you uses for the same date. */ dueKey?: string }

/** Every dated thing from today on: schedule items, milestones not reached yet, and booked discovery calls. Soonest first. */
function comingUp(projects: OfficeProject[], t: string): Dated[] {
  const out: Dated[] = []
  for (const p of projects) {
    if (p.pipelineStage === 'paid') continue
    const si = stageIndex(p.pipelineStage)
    for (const s of p.schedule) {
      const end = s.end && s.end > s.start ? s.end : s.start
      // Something already under way counts as today.
      if (end >= t) out.push({ date: s.start < t ? t : s.start, time: s.time, what: s.title, kind: s.kind ?? 'other', project: p })
    }
    for (const m of MILESTONE_LIST) {
      const date = p.milestones[m.key]
      if (date && date >= t && si < stageIndex(m.doneFrom)) out.push({ date, what: m.label, kind: 'milestone', project: p, dueKey: `due-${m.key}-${date}` })
    }
    const lead = p.office.lead
    if (isSalesStage(p.pipelineStage) && lead?.callDate && lead.callDate >= t) out.push({ date: lead.callDate, time: lead.callTime, what: 'Discovery call', kind: 'call', project: p })
  }
  return out.sort((a, b) => `${a.date} ${a.time ?? '99'}`.localeCompare(`${b.date} ${b.time ?? '99'}`))
}

const DELIVERY_LABEL = MILESTONE_LIST.find((m) => m.key === 'deliveryDue')?.label

/** Log and portal activity from the last 14 days, newest first. */
function lately(projects: OfficeProject[], t: string) {
  const from = addDays(t, -14)
  const items: { project: OfficeProject; at: string; day: string; text: string }[] = []
  for (const p of projects)
    for (const e of [...p.activity, ...(p.office.log ?? [])]) {
      if (!e.at || Number.isNaN(Date.parse(e.at))) continue
      const day = ymd(new Date(e.at))
      if (day >= from && day <= t) items.push({ project: p, at: e.at, day, text: e.text })
    }
  return items.sort((a, b) => b.at.localeCompare(a.at))
}


/* ── Pieces ─────────────────────────────────────────────────────────── */

/** A reminder opens the part of the project it is about: money for invoices, the portal tab for versions, the lead page for a lead. */
function rowHref(r: Row) {
  const k = r.key ?? ''
  const page = pageHref(r.project._id, r.project.pipelineStage)
  const room = /^comments-(.+)-v\d+$/.exec(k)
  if (room) return `/admin/review/${encodeURIComponent(r.project._id)}/${encodeURIComponent(room[1])}`
  if (!page.startsWith('/admin/projects/')) return page
  return /^(no-invoice|draft)-/.test(k) ? `${page}?tab=money` : /^(fixes|feedback)-/.test(k) ? `${page}?tab=portal` : page
}

/** One row in Needs you. Every source (reminders, follow-ups, deposits, things out with clients) is turned into this, so each thing shows once, in one style. */
type Need = { id: string; projectId: string; dismissKey?: string; href: string; client?: string; title: string; detail: string; when?: string; urgent?: boolean; nudge?: { email: string; first: string; title: string; client: string } }

function NeedRow({ n }: { n: Need }) {
  return (
    <DismissableRow projectId={n.projectId} dismissKey={n.dismissKey} label={`${n.title}: ${n.detail}`}>
      <Link href={n.href} className="a-row-main">
        {n.client && <span className="a-client">{n.client}</span>}
        <strong>{n.title}</strong>
        <span className="muted small">{n.detail}</span>
      </Link>
      <span className="a-row-side">
        {n.when && <span className={`small ${n.urgent ? 'a-urgent' : 'muted'}`}>{n.when}</span>}
        {n.nudge && (
          <a className="btn btn-secondary btn-sm" href={`mailto:${n.nudge.email}?subject=${encodeURIComponent(n.nudge.title)}&body=${encodeURIComponent(`Hi ${n.nudge.first},\n\nJust checking in on ${n.nudge.title}. `)}`}>
            Nudge<span className="sr-only"> {n.nudge.client} by email</span>
          </a>
        )}
      </span>
    </DismissableRow>
  )
}

/** The first few rows, then the rest behind "Show N more" (no script needed, and it stays open while you work down the list). */
function NeedList({ rows, max, empty }: { rows: Need[]; max: number; empty: string }) {
  if (!rows.length) return <p className="muted a-empty">{empty}</p>
  const rest = rows.slice(max)
  return (
    <>
      <ul className="a-rows">{rows.slice(0, max).map((n) => <NeedRow key={n.id} n={n} />)}</ul>
      {rest.length > 0 && (
        <details className="ap-more">
          <summary>Show {rest.length} more</summary>
          <ul className="a-rows">{rest.map((n) => <NeedRow key={n.id} n={n} />)}</ul>
        </details>
      )}
    </>
  )
}

type Item = { key: string; href: string; title: string; text: string; side?: string; urgent?: boolean }

function Items({ list, max }: { list: Item[]; max: number }) {
  const row = (x: Item) => (
    <li key={x.key}>
      <Link href={x.href} className="td-item">
        <strong>{x.title}</strong>
        <span className="muted">{x.text}</span>
      </Link>
      {x.side && <span className={`td-side ${x.urgent ? 'a-urgent' : 'muted'}`}>{x.side}</span>}
    </li>
  )
  const rest = list.slice(max)
  return (
    <>
      <ul className="td-list">{list.slice(0, max).map(row)}</ul>
      {rest.length > 0 && (
        <details className="ap-more">
          <summary>Show {rest.length} more</summary>
          <ul className="td-list">{rest.map(row)}</ul>
        </details>
      )}
    </>
  )
}

/** Urgent first; otherwise the order each source already ranks itself in. */
const ranked = (rows: Need[]) => rows.map((n, i) => ({ n, i })).sort((a, b) => Number(Boolean(b.n.urgent)) - Number(Boolean(a.n.urgent)) || a.i - b.i).map((x) => x.n)

/* ── The page ───────────────────────────────────────────────────────── */

export default async function Today() {
  // Checked here as well as in the layout: a page can be requested on its own.
  const admin = await requireAdmin()
  // One load: the projects, the portal payment records and the goals. Everything below is worked out from it.
  const [{ projects: all, payments, goals }, signRequests, suggestions] = await Promise.all([loadMoney(), listRequests().catch(() => []), listSuggestions()])
  // Archived projects are filed away: they raise no reminders and aren't listed. The money history
  // (owed, collected, signed) keeps them, so those figures are the Money page's own.
  const projects = all.filter((p) => !p.archived)
  const t = today()
  const canDismiss = !admin.viewOnly
  // The session carries an email only, so the name comes from settings when one sits beside that address.
  const name = (admin as { name?: string }).name?.trim().split(/\s+/)[0] || firstNameFor(admin.email)

  /* ── Money: the five figures, each from the same money load as the Money page ── */
  const money = moneyView(all, payments, goals, t)
  const sixMonths = reportView(all, payments, '12m', t).moneyByMonth.slice(-6)
  const tiles = pipelineTiles(projects)
  const signed = money.goalLines.find((g) => g.key === 'signedYear')
  // Pictures for the tiles, from the same figures: quotes to write against quotes out, what's been paid on the work in production, and signed against the goal.
  const toWrite = projects.filter((p) => p.pipelineStage === 'proposal').length
  const quoted = projects.filter((p) => p.pipelineStage === 'quoted').length
  const quotedWork = money.toBill.rows.filter((r) => r.total !== undefined)
  const paidOnWork = quotedWork.reduce((n, r) => n + r.paid, 0)
  const quotedTotal = quotedWork.reduce((n, r) => n + (r.total ?? 0), 0)
  // The goal sits at the tick, with room past it for a year that beats the goal.
  const signedScale = Math.max(signed?.share ?? 0, 1) * 1.12

  /* ── Needs you: things waiting on you, then things out with clients. Each thing once. ── */
  // Reminders (new leads to reply to, quotes to write, notes and comments in, invoices to make or send, milestones).
  const reminders: Need[] = needsAction(projects).map((r, i) => ({
    id: `r-${r.key ?? `${r.project._id}-${i}`}`,
    projectId: r.project._id,
    dismissKey: canDismiss ? r.key : undefined,
    href: rowHref(r),
    client: r.project.client.organizationName,
    title: r.project.title,
    detail: r.detail,
    when: r.when,
    urgent: r.urgent,
  }))
  // A week and a month after delivery.
  const follow: Need[] = followUps(projects, t).map((f) => ({
    id: `f-${f.project._id}-${f.key}`,
    projectId: f.project._id,
    dismissKey: canDismiss ? f.key : undefined,
    href: pageHref(f.project._id, f.project.pipelineStage),
    client: f.project.client.organizationName,
    title: f.project.title,
    detail: f.detail,
    when: f.when,
  }))
  // Booked with no deposit in, and nothing sent for it (an invoice or request already out counts as owed, on the Money page).
  const owedIds = new Set(money.owed.rows.map((b) => b.projectId).filter((x): x is string => Boolean(x)))
  const deposits: Need[] = depositsDue(projects, payments, owedIds)
    .map((p) => ({ id: `dep-${p._id}`, projectId: p._id, href: projectTab(p._id, 'money'), client: p.client.organizationName, title: p.title, detail: 'Ask for the deposit. Nothing has been sent for it yet.', when: p.depositAmount ? cad(p.depositAmount) : undefined }))
  const onYou = ranked([...reminders, ...deposits, ...follow])

  // Out with clients: cuts waiting on feedback and quotes with no answer (with Nudge), quotes shared before Quote sent, and documents out for signature.
  const theirs = waitingOnClients(projects)
  const nudges: Need[] = theirs.map((r, i) => {
    const c = r.project.client.contacts?.[0]
    return {
      id: `w-${r.key ?? `${r.project._id}-${i}`}`,
      projectId: r.project._id,
      dismissKey: canDismiss ? r.key : undefined,
      href: rowHref(r),
      client: r.project.client.organizationName,
      title: r.project.title,
      detail: r.detail,
      when: r.when,
      urgent: r.urgent,
      // No Nudge button when the first contact has no email (a lead saved with only a name).
      nudge: c?.email ? { email: c.email, first: c.name?.split(' ')[0] ?? 'there', title: r.project.title, client: r.project.client.organizationName } : undefined,
    }
  })
  const sharedQuotes: Need[] = projects
    .filter((p) => isSalesStage(p.pipelineStage) && p.pipelineStage !== 'quoted' && Boolean(p.quote?.sharedAt && !p.quote.signature))
    .map((p) => ({ id: `q-${p._id}`, projectId: p._id, href: pageHref(p._id, p.pipelineStage), client: p.client.organizationName, title: p.title, detail: `Quote out. ${quoteStatus(p) ?? 'No send date recorded.'}` }))
  // Documents sent from the Library: out for signature, and signed in the last 14 days.
  const docs = signCounts(signRequests)
  const docHref = (projectId?: string) => (projectId ? projectTab(projectId, 'documents') : '/admin/library?tab=out')
  const docsOut: Need[] = docs.out.map((r) => ({ id: `d-${r._id}`, projectId: r.projectId ?? '', href: docHref(r.projectId), client: r.projectTitle, title: r.snapshot.title, detail: `Out for signature with ${r.recipient.name}${r.viewedAt ? '. They’ve opened it.' : '.'}` }))
  const withClients = ranked([...nudges, ...sharedQuotes, ...docsOut])

  /* ── This week: calls, shoots, deliveries and other dates ── */
  const coming = comingUp(projects, t)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(t, i))
  const twoWeeks = nextTwoWeeks(projects)
  const end = addDays(t, 14)
  // Everything dated in the next seven days, plus shoots and deliveries in the week after (the same two things nextTwoWeeks counts).
  // A deadline already in Needs you (due within three days) isn't listed twice.
  const inNeeds = new Set(reminders.map((r) => `${r.projectId} ${r.id.slice(2)}`))
  const week = coming.filter((c) => (c.date <= weekDays[6] || (c.date <= end && (c.kind === 'shoot' || c.what === DELIVERY_LABEL))) && !(c.dueKey && inNeeds.has(`${c.project._id} ${c.dueKey}`)))
  const weekItems: Item[] = week.map((c, i) => ({
    key: `wk-${i}`,
    href: pageHref(c.project._id, c.project.pipelineStage),
    title: c.what,
    text: `${c.project.client.organizationName} · ${c.project.title}`,
    side: `${fmtDate(c.date, 'weekday')}${c.time ? ` · ${fmtTime(c.time)}` : ''}`,
  }))
  const later = coming.find((c) => c.date > end)
  const noDates = projects.filter((p) => stageIndex(p.pipelineStage) >= stageIndex('booked') && stageIndex(p.pipelineStage) < stageIndex('delivered') && !p.schedule.length && !Object.values(p.milestones).some(Boolean)).length

  /* ── Lately: signatures and activity from the last 14 days, folded away ── */
  const since = addDays(t, -14)
  const signedLately: Item[] = [
    ...projects
      .map((p) => ({ p, s: signing(p) }))
      .filter((x): x is { p: (typeof projects)[number]; s: { on: string; value?: number } } => Boolean(x.s?.on && x.s.on >= since))
      .sort((a, b) => b.s.on.localeCompare(a.s.on))
      .map(({ p, s }) => ({ key: `s-${p._id}`, href: pageHref(p._id, p.pipelineStage), title: p.title, text: `Quote signed ${fmtDate(s.on)}`, side: s.value ? cad(s.value) : undefined })),
    ...docs.signed.map((r) => ({ key: `ds-${r._id}`, href: docHref(r.projectId), title: r.snapshot.title, text: `Signed by ${r.signature?.name ?? r.recipient.name} ${fmtDate(r.signedAt!)}`, side: r.projectTitle })),
  ]
  const recent = lately(projects, t)

  return (
    <div className="a-page td tdx">
      <header className="a-head">
        <div className="stack ap-gap-2">
          <h1 className="a-h1">{hello()}{name ? `, ${name}` : ''}.</h1>
          <p className="td-date">{fmtDay(t, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
        {/* New lead starts someone at the first stage; New project is for work that's already agreed. */}
        <div className="tdx-head-actions">
          <Link className="btn btn-primary" href="/admin/leads/new">New lead</Link>
          <Link className="btn btn-secondary" href="/admin/projects/new">New project</Link>
        </div>
      </header>

      {/* ── 1. Needs you ── */}
      <section className="tdx-block" aria-labelledby="td-needs-h">
        <div className="ap-h2-row">
          <h2 id="td-needs-h" className="a-h2 a-h2-lg">Needs you</h2>
          <DismissCount className="ap-count" initial={onYou.length} one="thing" none="All clear" />
        </div>

        {/* People from a call or an email who look like new clients (src/admin/capture.ts). Shows only when some are waiting. */}
        <LeadSuggestions
          canAct={canDismiss}
          items={suggestions
            .filter((x) => x.status === 'new')
            .map((x) => ({ key: x._key, source: x.source, name: x.name, company: x.company, email: x.email, summary: x.summary, when: x.when, title: x.title }))}
        />

        <div className="p-card">
          <NeedList rows={onYou} max={6} empty="Nothing is waiting on you. New leads, client notes, invoices to send and follow-ups show up here." />
          {withClients.length > 0 && (
            <details className="ap-details">
              <summary>Waiting on clients · {withClients.length}</summary>
              <NeedList rows={withClients} max={5} empty="" />
            </details>
          )}
        </div>
      </section>

      {/* ── 2. Money ── */}
      <section className="tdx-block" aria-labelledby="td-money-h">
        <div className="ap-h2-row">
          <h2 id="td-money-h" className="a-h2 a-h2-lg">Money</h2>
          <Link className="text-link small" href="/admin/money">Open Money</Link>
        </div>
        <div className="td-money">
          <Link href="/admin/money#owed" className="a-kpi td-tile">
            <span className="a-kpi-label">Owed to you</span>
            <span className="a-kpi-num">{cad(money.owed.total)}</span>
            <span className="a-kpi-note">{plural(money.owed.rows.length, 'open invoice or payment', 'open invoices and payments')}{money.owed.clearing ? `, ${money.owed.clearing} clearing` : ''}</span>
          </Link>
          <Link href="/admin/money" className="a-kpi td-tile">
            <span className="a-kpi-label">Collected this month</span>
            <span className="a-kpi-num">{cad(money.collectedMonth.total)}</span>
            <span className="a-kpi-note">{plural(money.collectedMonth.count, 'payment')} in {money.monthLabel}</span>
            <span className="gx-wrap" role="img" aria-label={`Collected in the last six months: ${sixMonths.map((m) => `${m.label} ${cad(m.collected)}`).join(', ')}.`}>
              <MiniCols cols={sixMonths.map((m, i) => ({ label: m.label.slice(0, 1), value: m.collected, current: i === sixMonths.length - 1 }))} />
            </span>
          </Link>
          <Link href="/admin/pipeline" className="a-kpi td-tile">
            <span className="a-kpi-label">Open pipeline</span>
            <span className="a-kpi-num">{cad(tiles.inPlay.sum)}</span>
            <span className="a-kpi-note">{plural(tiles.inPlay.count, 'quote')} in play{tiles.inPlay.missing ? `, ${tiles.inPlay.missing} with no total yet` : ''}</span>
            {toWrite + quoted > 0 && <SplitBar parts={[{ label: 'To write', value: toWrite, text: String(toWrite), tone: 'soft' }, { label: 'Out', value: quoted, text: String(quoted), tone: 'accent' }]} />}
          </Link>
          <Link href="/admin/pipeline" className="a-kpi td-tile">
            <span className="a-kpi-label">In production</span>
            <span className="a-kpi-num">{cad(tiles.production.sum)}</span>
            <span className="a-kpi-note">{plural(tiles.production.count, 'project')}, Onboarding to Final delivery</span>
            {quotedTotal > 0 && (
              <span className="gx-wrap">
                <Bar value={paidOnWork / quotedTotal} />
                <span className="gx-caption">{cad(paidOnWork)} paid of {cad(quotedTotal)} quoted</span>
              </span>
            )}
          </Link>
          <Link href="/admin/money" className="a-kpi td-tile">
            <span className="a-kpi-label">Signed this year</span>
            <span className="a-kpi-num">{cad(signed?.value ?? 0)}</span>
            <span className="a-kpi-note">{signed?.goal && signed.share !== undefined ? `${Math.round(signed.share * 100)}% of the ${cad(signed.goal)} goal` : 'No goal set'}</span>
            {signed?.goal && signed.share !== undefined ? (
              <span className="gx-wrap">
                <Bar value={signed.share / signedScale} tick={1 / signedScale} />
                <span className="gx-caption">The tick is the goal</span>
              </span>
            ) : null}
          </Link>
        </div>
      </section>

      {/* ── 3. This week ── */}
      <section className="tdx-block" aria-labelledby="td-week-h">
        <div className="ap-h2-row">
          <h2 id="td-week-h" className="a-h2 a-h2-lg">This week</h2>
          <span className="ap-count">{plural(twoWeeks.shoots, 'shoot')} and {plural(twoWeeks.deliveries, 'delivery', 'deliveries')} in the next 14 days</span>
        </div>
        <div className="tdx-week">
          <div className="p-card td-card">
            <DayStrip
              label="The next seven days"
              cells={weekDays.map((d) => {
                const n = coming.filter((c) => c.date === d).length
                return {
                  key: d,
                  label: weekday(d),
                  value: <>{Number(d.slice(8))}{d === t && <span className="sr-only"> (today)</span>}</>,
                  note: n ? plural(n, 'thing') : <span className="sr-only">nothing booked</span>,
                  level: n ? Math.min(1, 0.5 + n / 4) : 0,
                  current: d === t,
                }
              })}
            />
            {weekItems.length ? (
              <Items list={weekItems} max={5} />
            ) : (
              <p className="tdx-empty-next">
                {later ? (
                  <>Nothing booked in the next two weeks. Next up: <Link className="text-link" href={pageHref(later.project._id, later.project.pipelineStage)}>{later.what}, {later.project.title}</Link>, {fmtDate(later.date, 'weekday')} ({relDays(later.date, t)}).</>
                ) : (
                  'Nothing dated is coming up.'
                )}
              </p>
            )}
            {noDates > 0 && (
              <p className="small a-empty">
                <Link className="text-link" href="/admin/pipeline">{noDates === 1 ? '1 booked project has no dates yet' : `${noDates} booked projects have no dates yet`}</Link>
              </p>
            )}
          </div>
          <TodayTasks />
        </div>
      </section>

      <details className="p-card a-bucket">
        <summary className="a-card-head">
          <h2 className="a-h2">Lately · {recent.length + signedLately.length} in the last 14 days</h2>
        </summary>
        {signedLately.length > 0 && (
          <div className="tdx-signed">
            <h3 className="tdx-sub">Signed</h3>
            <Items list={signedLately} max={5} />
          </div>
        )}
        {recent.length ? (
          <>
            {signedLately.length > 0 && <h3 className="tdx-sub">Activity</h3>}
            <ul className="td-lately">
              {recent.slice(0, 30).map((r, i) => (
                <li key={i}>
                  <span className="muted">{fmtDate(r.day)}</span>
                  <Link className="text-link-plain td-lately-project" href={pageHref(r.project._id, r.project.pipelineStage)}>{r.project.title}</Link>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
            {recent.length > 30 && <p className="muted small a-empty">Showing the newest 30.</p>}
          </>
        ) : (
          <p className="muted small a-empty">Nothing logged in the last 14 days.</p>
        )}
      </details>
    </div>
  )
}
