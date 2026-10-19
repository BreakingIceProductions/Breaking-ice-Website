import Link from 'next/link'
import { adminSampleMode } from '@/admin/config'
import { listProjects } from '@/admin/data'
import { fmtDay, today, weekday } from '@/admin/dates'
import { activityFeed, ago, cad, kpis, needsAction, waitingOnClients, week, type Row } from '@/admin/insights'
import { stageTitle } from '@/admin/stages'
import { isDueByToday, openTasks, taskDay, ticktickConnection, type OpenTask } from '@/admin/ticktick'
import type { OfficeProject } from '@/admin/types'

export const metadata = { title: 'Dashboard' }

const hello = () => {
  const h = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

async function todaysTasks(projects: OfficeProject[]) {
  if (adminSampleMode()) {
    const s = (title: string, p: OfficeProject) => ({ task: { id: title, projectId: '', title, status: 0 } as OpenTask, project: p })
    return { connected: true, tasks: [s('Apply round 2 notes', projects[0]), s('Export rough cut v1', projects[2]), s('Create October invoice', projects[1]), s('Confirm charter', projects[5])] }
  }
  if (!(await ticktickConnection().catch(() => null))) return { connected: false, tasks: [] }
  const withList = projects.filter((p) => p.office.ticktickProjectId && p.pipelineStage !== 'paid').slice(0, 12)
  const lists = await Promise.all(
    withList.map((p) => openTasks(p.office.ticktickProjectId!).then((ts) => ts.map((task) => ({ task, project: p }))).catch(() => [])),
  )
  const tasks = lists
    .flat()
    .filter((x) => isDueByToday(x.task))
    .sort((a, b) => (taskDay(a.task) ?? '').localeCompare(taskDay(b.task) ?? ''))
  return { connected: true, tasks: tasks.slice(0, 8) }
}

function RowList({ rows, empty, nudge }: { rows: Row[]; empty: string; nudge?: boolean }) {
  if (!rows.length) return <p className="muted small a-empty">{empty}</p>
  return (
    <ul className="a-rows">
      {rows.slice(0, 6).map((r, i) => (
        <li key={`${r.project._id}-${i}`}>
          <Link href={`/admin/projects/${r.project._id}`} className="a-row-main">
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
        </li>
      ))}
    </ul>
  )
}

export default async function Dashboard() {
  const projects = await listProjects()
  const k = kpis(projects)
  const [tasks] = await Promise.all([todaysTasks(projects)])
  const days = week(projects)
  const feed = activityFeed(projects)
  const t = today()

  return (
    <div className="a-page">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">{fmtDay(t, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          <h1 className="a-h1">{hello()}, Josh.</h1>
        </div>
        <div className="btn-row">
          <a className="btn btn-primary" href="/studio/portal/intent/create/template=clientProject;type=clientProject" target="_blank" rel="noopener noreferrer">
            New project<span className="sr-only"> (opens the Studio)</span>
          </a>
        </div>
      </header>

      <section aria-label="At a glance" className="a-kpis">
        <div className="a-kpi">
          <span className="a-kpi-label">Active projects</span>
          <span className="a-kpi-num">{k.active}</span>
          <span className="a-kpi-note">{k.activeNote}</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Pipeline</span>
          <span className="a-kpi-num">{k.pipelineCount ? cad(k.pipeline) : '$0'}</span>
          <span className="a-kpi-note">
            {k.pipelineCount} quote{k.pipelineCount === 1 ? '' : 's'} out{k.pipelineMissing ? `, ${k.pipelineMissing} without a total` : ''}
          </span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Delivered, not invoiced</span>
          <span className={`a-kpi-num ${k.notInvoicedCount ? 'a-accent' : ''}`}>{cad(k.notInvoiced)}</span>
          <span className="a-kpi-note">{k.notInvoicedCount ? `${k.notInvoicedCount} project${k.notInvoicedCount === 1 ? '' : 's'}. Money at risk` : 'Nothing waiting'}</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Outstanding invoices</span>
          <span className="a-kpi-num">{cad(k.outstanding)}</span>
          <span className="a-kpi-note">
            {k.outstandingCount} awaiting payment{k.draftCount ? ` · ${k.draftCount} draft${k.draftCount === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </section>

      <div className="a-grid-2">
        <section className="p-card" aria-labelledby="h-action">
          <div className="a-card-head">
            <h2 id="h-action" className="a-h2">Needs your action</h2>
            <span className="muted small">Ball’s in your court</span>
          </div>
          <RowList rows={needsAction(projects)} empty="Nothing waiting on you. Nice." />
        </section>
        <section className="p-card" aria-labelledby="h-wait">
          <div className="a-card-head">
            <h2 id="h-wait" className="a-h2">Waiting on clients</h2>
            <span className="muted small">Ball’s in theirs</span>
          </div>
          <RowList rows={waitingOnClients(projects)} empty="No one owes you anything right now." nudge />
        </section>
      </div>

      <section className="p-card" aria-labelledby="h-week">
        <div className="a-card-head">
          <h2 id="h-week" className="a-h2">This week</h2>
          <ul className="a-legend" aria-label="Legend">
            <li><span className="a-swatch k-shoot" />Shoot</li>
            <li><span className="a-swatch k-travel" />Travel</li>
            <li><span className="a-swatch k-deadline" />Deadline</li>
            <li><span className="a-swatch k-meeting" />Meeting</li>
          </ul>
        </div>
        <div className="a-week-scroll">
          <ol className="a-week">
            {days.map((d) => (
              <li key={d.date} className={d.date === t ? 'is-today' : undefined}>
                <span className="a-day">
                  <span className="a-dow">{weekday(d.date)}</span>
                  <span className="a-date">{Number(d.date.slice(8))}</span>
                  {d.date === t && <span className="sr-only">(today)</span>}
                </span>
                {d.events.map((e, i) => (
                  <Link key={i} href={`/admin/projects/${e.project._id}`} className={`a-event k-${e.kind}`}>
                    <strong>{e.title}</strong>
                    <span>{e.meta}</span>
                  </Link>
                ))}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="a-grid-2">
        <section className="p-card" aria-labelledby="h-tasks">
          <div className="a-card-head">
            <h2 id="h-tasks" className="a-h2">Today’s tasks</h2>
            {tasks.connected && <a className="text-link small" href="https://ticktick.com/webapp" target="_blank" rel="noopener noreferrer">Open TickTick</a>}
          </div>
          {!tasks.connected ? (
            <p className="muted small a-empty">
              <Link className="text-link" href="/admin/settings">Connect TickTick</Link> to see what’s due today.
            </p>
          ) : tasks.tasks.length ? (
            <ul className="a-tasks">
              {tasks.tasks.map(({ task, project }) => (
                <li key={task.id}>
                  <span className="a-box" aria-hidden="true" />
                  <span className="stack">
                    <span>{task.title}</span>
                    <span className="muted small">
                      {project.client.organizationName} · {project.title}
                      {taskDay(task) && taskDay(task)! < t ? ` · due ${fmtDay(taskDay(task))}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small a-empty">Nothing due today.</p>
          )}
          {tasks.connected && <p className="muted small" style={{ margin: 0 }}>Tick things off in TickTick.</p>}
        </section>
        <section className="p-card" aria-labelledby="h-act">
          <h2 id="h-act" className="a-h2">Recent activity</h2>
          {feed.length ? (
            <ul className="a-feed">
              {feed.map((f, i) => (
                <li key={i}>
                  <span className="stack">
                    <span>{f.text}</span>
                    <span className="muted small">
                      <Link className="text-link-plain" href={`/admin/projects/${f.project._id}`}>{f.project.title}</Link> · {f.source}
                    </span>
                  </span>
                  <span className="muted small">{ago(f.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small a-empty">Nothing yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}
