import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { nextTwoWeeks, pipelineTiles, quoteStatus } from '@/admin/board-data'
import { TZ, addDays, daysBetween, daysSince, fmtDay, relDays, today, weekday, ymd } from '@/admin/dates'
import { cad, needsAction, waitingOnClients, type Row } from '@/admin/insights'
import { fmtTime, isContactLog, isSalesStage, pageHref } from '@/admin/lead'
import { MILESTONE_LIST } from '@/admin/milestones'
import { moneyView, reportView, signing } from '@/admin/money'
import { loadMoney } from '@/admin/money-data'
import { portalsOverview } from '@/admin/portals'
import { STAGE_TASKS, stageIndex, stageTitle } from '@/admin/stages'
import type { OfficeProject } from '@/admin/types'
import { DismissableRow } from '@/admin/ui/dismissable-row'
import { Bar, DayStrip, MiniCols, SplitBar } from '@/admin/ui/graphics'
import { TodayTasks } from '@/admin/ui/today-tasks'
import { portalEnv } from '@/portal/config'

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

type Dated = { date: string; time?: string; what: string; kind: 'shoot' | 'travel' | 'meeting' | 'other' | 'milestone' | 'call'; project: OfficeProject }

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
      if (date && date >= t && si < stageIndex(m.doneFrom)) out.push({ date, what: m.label, kind: 'milestone', project: p })
    }
    const lead = p.office.lead
    if (isSalesStage(p.pipelineStage) && lead?.callDate && lead.callDate >= t) out.push({ date: lead.callDate, time: lead.callTime, what: 'Discovery call', kind: 'call', project: p })
  }
  return out.sort((a, b) => `${a.date} ${a.time ?? '99'}`.localeCompare(`${b.date} ${b.time ?? '99'}`))
}

/** The stage checklist step that asks for a testimonial, as it is stored once ticked. */
const TESTIMONIAL_CHECK = `delivered:${STAGE_TASKS.delivered.findIndex((x) => /testimonial/i.test(x.title))}`
const DELIVERY_LABEL = MILESTONE_LIST.find((m) => m.key === 'deliveryDue')?.label

type FollowUp = { project: OfficeProject; key: string; detail: string; when: string }

/** Moments after a film is delivered: a week on (testimonial, unless that step is ticked) and a month on. Needs the delivery day in the stage history. */
function followUps(projects: OfficeProject[], t: string): FollowUp[] {
  const out: FollowUp[] = []
  for (const p of projects) {
    if (p.pipelineStage !== 'delivered' && p.pipelineStage !== 'paid') continue
    const at = (p.office.stageHistory ?? []).filter((h) => h.to === 'delivered' && !Number.isNaN(Date.parse(h.at))).map((h) => h.at).sort().at(-1)
    if (!at) continue
    const day = ymd(new Date(at))
    const n = daysBetween(day, t)
    const dismissed = new Set(p.office.dismissed ?? [])
    const when = `Delivered ${fmtDay(day)} · ${plural(n, 'day')} ago`
    const add = (key: string, detail: string) => !dismissed.has(key) && out.push({ project: p, key, detail, when })
    if (n >= 7 && !(p.office.checks ?? []).includes(TESTIMONIAL_CHECK)) add(`followup-testimonial-${day}`, 'A week since delivery. Ask for a testimonial.')
    if (n >= 30) add(`followup-checkin-${day}`, 'A month since delivery. Check in.')
  }
  return out
}

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

/** The dismissable reminders, as before. View-only sign-ins get the rows without the dismiss button, which would be refused. */
function RowList({ rows, empty, nudge, canDismiss }: { rows: Row[]; empty: string; nudge?: boolean; canDismiss: boolean }) {
  if (!rows.length) return <p className="muted small a-empty">{empty}</p>
  return (
    <ul className="a-rows">
      {rows.slice(0, 6).map((r, i) => (
        <DismissableRow key={r.key ?? `${r.project._id}-${i}`} projectId={r.project._id} dismissKey={canDismiss ? r.key : undefined} label={`${r.project.title}: ${r.detail}`}>
          <Link href={rowHref(r)} className="a-row-main">
            <span className="a-client">{r.project.client.organizationName}</span>
            <strong>{r.project.title}</strong>
            <span className="muted small">{r.detail}</span>
          </Link>
          <span className="a-row-side">
            {!nudge && <span className="a-stage">{stageTitle(r.project.pipelineStage)}</span>}
            <span className={`small ${r.urgent ? 'a-urgent' : 'muted'}`}>{r.when}</span>
            {nudge && (
              <a
                className="btn btn-secondary btn-sm"
                href={`mailto:${r.project.client.contacts?.[0]?.email ?? ''}?subject=${encodeURIComponent(r.project.title)}&body=${encodeURIComponent(`Hi ${r.project.client.contacts?.[0]?.name?.split(' ')[0] ?? 'there'},\n\nJust checking in on ${r.project.title}. `)}`}
              >
                Nudge<span className="sr-only"> {r.project.client.organizationName} by email</span>
              </a>
            )}
          </span>
        </DismissableRow>
      ))}
    </ul>
  )
}

type Item = { key: string; href: string; title: string; text: string; side?: string; urgent?: boolean }

function Items({ list, empty, max }: { list: Item[]; empty: string; max?: number }) {
  if (!list.length) return <p className="muted small a-empty">{empty}</p>
  const shown = max ? list.slice(0, max) : list
  return (
    <ul className="td-list">
      {shown.map((x) => (
        <li key={x.key}>
          <Link href={x.href} className="td-item">
            <strong>{x.title}</strong>
            <span className="muted">{x.text}</span>
          </Link>
          {x.side && <span className={`td-side ${x.urgent ? 'a-urgent' : 'muted'}`}>{x.side}</span>}
        </li>
      ))}
      {shown.length < list.length && <li className="muted">and {list.length - shown.length} more</li>}
    </ul>
  )
}

function CountTile({ title, count, unit, href, items, empty, note }: { title: string; count: number; unit: string; href: string; items: Item[]; empty: string; note?: string }) {
  return (
    <div className="p-card td-count">
      <div className="a-card-head">
        <h3 className="td-h3">{title}</h3>
        <Link className="text-link small" href={href}>See all<span className="sr-only">: {title.toLowerCase()}</span></Link>
      </div>
      <p className="td-count-num">
        {count}
        <span className="sr-only"> {unit}</span>
      </p>
      <Items list={items} empty={empty} max={2} />
      {note && <p className="muted small a-empty">{note}</p>}
    </div>
  )
}

/* ── The page ───────────────────────────────────────────────────────── */

export default async function Today() {
  // Checked here as well as in the layout: a page can be requested on its own.
  const admin = await requireAdmin()
  // One load: the projects, the portal payment records and the goals. Everything below is worked out from it.
  const { projects: all, payments, goals } = await loadMoney()
  // Archived projects are filed away: they raise no reminders and aren't listed. The money history
  // (owed, collected, signed) keeps them, so those figures are the Money page's own.
  const projects = all.filter((p) => !p.archived)
  const t = today()
  const canDismiss = !admin.viewOnly
  // The session carries an email only, so the name comes from settings when one sits beside that address.
  const name = (admin as { name?: string }).name?.trim().split(/\s+/)[0] || firstNameFor(admin.email)

  // Money row
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

  // Up next and calls
  const coming = comingUp(projects, t)
  const next = coming[0]
  const noDates = projects.filter((p) => stageIndex(p.pipelineStage) >= stageIndex('booked') && stageIndex(p.pipelineStage) < stageIndex('delivered') && !p.schedule.length && !Object.values(p.milestones).some(Boolean)).length
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(t, i))
  const calls = coming.filter((c) => (c.kind === 'call' || c.kind === 'meeting') && c.date <= weekDays[6])

  // Counts. Waiting on you / on clients are the Client portals page's own lists.
  const portals = portalsOverview(all, payments.filter((x) => x.status === 'due' || x.status === 'processing'))
  const cards = [...portals.live, ...portals.quotes]
  const onYou = cards.flatMap((c) => c.onYou.map((w) => ({ c, w })))
  const onClient = cards.flatMap((c) => c.onClient.map((w) => ({ c, w })))
  const asItem = ({ c, w }: (typeof onYou)[number]): Item => ({ key: `${c.id}-${w.key}`, href: w.href && !w.external ? w.href : c.href, title: c.title, text: w.text, side: w.when, urgent: w.urgent })
  const notes = onYou.filter((x) => /^(fixes|comments)-/.test(x.w.key)).map(asItem)
  const withClients = onClient.map(asItem)
  const cutsOut = onClient.filter((x) => x.w.key.startsWith('feedback-')).map((x) => ({ ...asItem(x), href: x.c.quoteOnly ? x.c.href : projectTab(x.c.id, 'portal') }))
  const owed: Item[] = money.owed.rows.map((b) => ({ key: b.key, href: projectTab(b.projectId, 'money'), title: b.project, text: `${b.label} · ${b.status}`, side: cad(b.owed) }))
  const newLeads: Item[] = projects
    .filter((p) => p.pipelineStage === 'lead' && !(p.office.log ?? []).some((l) => isContactLog(l.kind)))
    .map((p) => {
      const d = daysSince(p.office.stageChangedAt)
      return { key: p._id, href: pageHref(p._id, p.pipelineStage), title: p.title, text: p.client.organizationName, side: d === null ? undefined : d ? `${plural(d, 'day')} waiting` : 'In today', urgent: (d ?? 0) >= 2 }
    })

  // This week
  const depositsOut: Item[] = projects
    .filter(
      (p) =>
        p.pipelineStage === 'booked' &&
        !(p.office.invoices ?? []).some((i) => i.kind === 'deposit' && i.status === 'paid') &&
        !payments.some((x) => x.projectId === p._id && x.kind === 'deposit' && x.status === 'paid') &&
        // An invoice or payment request already out for it is in the list above.
        !money.owed.rows.some((b) => b.projectId === p._id),
    )
    .map((p) => ({ key: `dep-${p._id}`, href: projectTab(p._id, 'money'), title: p.title, text: 'Deposit not in, and nothing sent for it yet', side: p.depositAmount ? cad(p.depositAmount) : undefined }))
  const quotesOut: Item[] = projects
    .filter((p) => isSalesStage(p.pipelineStage) && (p.pipelineStage === 'quoted' || Boolean(p.quote?.sharedAt && !p.quote.signature)))
    .map((p) => {
      const d = p.pipelineStage === 'quoted' ? daysSince(p.office.stageChangedAt) : null
      return { key: `q-${p._id}`, href: pageHref(p._id, p.pipelineStage), title: p.title, text: `Quote out. ${quoteStatus(p) ?? 'No send date recorded'}`, side: d === null ? undefined : plural(d, 'day'), urgent: (d ?? 0) >= 7 }
    })
  const since = addDays(t, -14)
  const signedLately: Item[] = projects
    .map((p) => ({ p, s: signing(p) }))
    .filter((x): x is { p: (typeof projects)[number]; s: { on: string; value?: number } } => Boolean(x.s?.on && x.s.on >= since))
    .sort((a, b) => b.s.on.localeCompare(a.s.on))
    .map(({ p, s }) => ({ key: `s-${p._id}`, href: pageHref(p._id, p.pipelineStage), title: p.title, text: `Signed ${fmtDay(s.on)}`, side: s.value ? cad(s.value) : undefined }))
  const twoWeeks = nextTwoWeeks(projects)
  const end = addDays(t, 14)
  // The same two things nextTwoWeeks counts: shoots that start in the window, and delivery dates not reached yet.
  const shootsAndDeliveries: Item[] = [
    ...projects.flatMap((p) => p.schedule.filter((s) => s.kind === 'shoot' && s.start >= t && s.start <= end).map((s) => ({ p, date: s.start, what: s.title }))),
    ...projects
      .filter((p) => stageIndex(p.pipelineStage) < stageIndex('delivered') && p.milestones.deliveryDue && p.milestones.deliveryDue >= t && p.milestones.deliveryDue <= end)
      .map((p) => ({ p, date: p.milestones.deliveryDue!, what: DELIVERY_LABEL ?? 'Final delivery' })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x, i) => ({ key: `sd-${i}`, href: pageHref(x.p._id, x.p.pipelineStage), title: x.p.title, text: x.what, side: `${fmtDay(x.date)} · ${relDays(x.date, t)}` }))

  // Needs you, follow-ups, lately
  const mine = needsAction(projects)
  const theirs = waitingOnClients(projects)
  const follow = followUps(projects, t)
  const recent = lately(projects, t)

  return (
    <div className="a-page td">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <h1 className="a-h1">{hello()}{name ? `, ${name}` : ''}.</h1>
          {/* The Studio makes a project at any stage (work already booked, a retainer month); the lead form only starts one at New lead. */}
          <div className="btn-row">
            <Link className="btn btn-primary" href="/admin/leads/new">New lead</Link>
            <a className="text-link small" href="/studio/portal/intent/create/template=clientProject;type=clientProject" target="_blank" rel="noopener noreferrer">
              New project in the Studio<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
        <p className="td-date">{fmtDay(t, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </header>

      <section aria-labelledby="td-money-h">
        <h2 id="td-money-h" className="sr-only">Money</h2>
        <div className="td-money">
          <Link href="/admin/money" className={`a-kpi td-tile${money.owed.total ? ' is-hot' : ''}`}>
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

      <div className="a-grid-2">
        <section className="p-card" aria-labelledby="td-next-h">
          <h2 id="td-next-h" className="a-h2">Up next</h2>
          {next ? (
            <Link href={pageHref(next.project._id, next.project.pipelineStage)} className="td-next">
              <span className="a-client">{next.project.client.organizationName}</span>
              <strong className="td-next-title">{next.project.title}</strong>
              <span>{next.what}{next.time ? ` at ${fmtTime(next.time)}` : ''}</span>
              <span className="td-next-when">
                <strong>{relDays(next.date, t)}</strong> · {fmtDay(next.date, { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </Link>
          ) : (
            <p className="muted small a-empty">Nothing dated is coming up.</p>
          )}
          {noDates > 0 && (
            <p className="small a-empty">
              <Link className="text-link" href="/admin/pipeline">{noDates === 1 ? '1 project has no dates yet' : `${noDates} projects have no dates yet`}</Link>
            </p>
          )}
        </section>

        <section className="p-card" aria-labelledby="td-calls-h">
          <h2 id="td-calls-h" className="a-h2">Calls</h2>
          <DayStrip
            label="The next seven days"
            cells={weekDays.map((d) => {
              const n = calls.filter((c) => c.date === d).length
              return {
                key: d,
                label: weekday(d),
                value: <>{Number(d.slice(8))}{d === t && <span className="sr-only"> (today)</span>}</>,
                note: n ? plural(n, 'call') : <span className="sr-only">no calls</span>,
                level: n ? Math.min(1, 0.5 + n / 4) : 0,
                current: d === t,
              }
            })}
          />
          {calls.length ? (
            <ul className="td-list">
              {calls.map((c, i) => (
                <li key={i}>
                  <Link href={pageHref(c.project._id, c.project.pipelineStage)} className="td-item">
                    <strong>{c.what}</strong>
                    <span className="muted">{c.project.client.organizationName} · {c.project.title}</span>
                  </Link>
                  <span className="td-side muted">{fmtDay(c.date, { weekday: 'short', month: 'short', day: 'numeric' })}{c.time ? ` · ${fmtTime(c.time)}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small a-empty">No calls this week.</p>
          )}
          <p className="muted small a-empty">Booking pages arrive when Google Calendar is connected.</p>
        </section>
      </div>

      <section aria-labelledby="td-counts-h">
        <h2 id="td-counts-h" className="sr-only">What’s waiting</h2>
        <div className="td-counts">
          <CountTile
            title="Review notes in"
            count={notes.length}
            unit={notes.length === 1 ? 'set of client notes waiting on you' : 'sets of client notes waiting on you'}
            href="/admin/portals"
            items={notes}
            empty="No client notes waiting on you."
            note={portals.tiles.onYou ? `${plural(portals.tiles.onYou, 'thing')} waiting on you across portals` : undefined}
          />
          <CountTile title="Money due" count={owed.length} unit={owed.length === 1 ? 'invoice or payment owed' : 'invoices and payments owed'} href="/admin/money" items={owed} empty="Nothing owed right now." />
          <CountTile title="Leads to reply to" count={newLeads.length} unit={newLeads.length === 1 ? 'new lead with no contact logged' : 'new leads with no contact logged'} href="/admin/pipeline" items={newLeads} empty="Every new lead has heard from you." />
          <CountTile title="Waiting on clients" count={withClients.length} unit={withClients.length === 1 ? 'thing out with clients' : 'things out with clients'} href="/admin/portals" items={withClients} empty="Nothing is out with clients." />
        </div>
      </section>

      <section aria-labelledby="td-week-h" className="stack td-section">
        <h2 id="td-week-h" className="a-h2">This week</h2>
        <div className="td-cards">
          <div className="p-card td-card">
            <h3 className="td-h3">Money to collect</h3>
            <p className="td-sum">{plural(owed.length, 'open invoice or payment', 'open invoices and payments')}{depositsOut.length ? `, ${plural(depositsOut.length, 'deposit')} not asked for` : ''}</p>
            <Items list={[...owed, ...depositsOut]} empty="Nothing to collect right now." max={5} />
          </div>
          <div className="p-card td-card">
            <h3 className="td-h3">Signatures</h3>
            <p className="td-sum">{plural(quotesOut.length, 'quote')} out, {signedLately.length} signed in the last 14 days</p>
            <Items list={[...quotesOut, ...signedLately]} empty="No quotes out, and none signed lately." max={5} />
          </div>
          <div className="p-card td-card">
            <h3 className="td-h3">Cuts and feedback</h3>
            <p className="td-sum">{cutsOut.length} with the client, {notes.length} with notes back for you</p>
            <Items list={[...notes, ...cutsOut]} empty="No cuts out for review." max={5} />
          </div>
          <div className="p-card td-card">
            <h3 className="td-h3">Shoots and deliveries</h3>
            <p className="td-sum">{plural(twoWeeks.shoots, 'shoot')} and {plural(twoWeeks.deliveries, 'delivery', 'deliveries')} in the next 14 days</p>
            <Items list={shootsAndDeliveries} empty="No shoots or deliveries in the next two weeks." max={5} />
          </div>
        </div>
      </section>

      <TodayTasks />

      <section aria-labelledby="td-todo-h" className="stack td-section">
        <div className="a-card-head">
          <h2 id="td-todo-h" className="a-h2">Other to-dos</h2>
          <span className="muted small">Calls to log, quotes to write and clients to nudge show up here.</span>
        </div>
        <div className="a-grid-2">
          <div className="p-card">
            <div className="a-card-head">
              <h3 className="td-h3">Needs you</h3>
              <span className="muted small">Ball’s in your court</span>
            </div>
            <RowList rows={mine} empty="Nothing waiting on you. Nice." canDismiss={canDismiss} />
          </div>
          <div className="p-card">
            <div className="a-card-head">
              <h3 className="td-h3">Clients to nudge</h3>
              <span className="muted small">Ball’s in theirs</span>
            </div>
            <RowList rows={theirs} empty="No one owes you anything right now." nudge canDismiss={canDismiss} />
          </div>
        </div>
      </section>

      <section className="p-card" aria-labelledby="td-follow-h">
        <h2 id="td-follow-h" className="a-h2">Follow-ups</h2>
        {follow.length ? (
          <ul className="a-rows">
            {follow.map((f) => (
              <DismissableRow key={`${f.project._id}-${f.key}`} projectId={f.project._id} dismissKey={canDismiss ? f.key : undefined} label={`${f.project.title}: ${f.detail}`}>
                <Link href={pageHref(f.project._id, f.project.pipelineStage)} className="a-row-main">
                  <span className="a-client">{f.project.client.organizationName}</span>
                  <strong>{f.project.title}</strong>
                  <span className="muted small">{f.detail}</span>
                </Link>
                <span className="a-row-side">
                  <span className="small muted">{f.when}</span>
                </span>
              </DismissableRow>
            ))}
          </ul>
        ) : (
          <p className="muted small a-empty">No follow-ups due. They show up here when a film hits a real moment: the final, go-live, a month out.</p>
        )}
      </section>

      <details className="p-card a-bucket">
        <summary className="a-card-head">
          <h2 className="a-h2">Lately · {recent.length} in the last 14 days</h2>
        </summary>
        {recent.length ? (
          <>
            <ul className="td-lately">
              {recent.slice(0, 30).map((r, i) => (
                <li key={i}>
                  <span className="muted">{fmtDay(r.day)}</span>
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
