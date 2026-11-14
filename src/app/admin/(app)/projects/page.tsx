import { requireAdmin } from '@/admin/auth'
import Link from 'next/link'
import { boardCard, nextTwoWeeks } from '@/admin/board-data'
import { listProjects } from '@/admin/data'
import { fmtDay } from '@/admin/dates'
import { cad, isActive, needsAction } from '@/admin/insights'
import { MILESTONE_LIST } from '@/admin/milestones'
import { stageIndex } from '@/admin/stages'
import { Board } from '@/admin/ui/board'
import { Bucket } from '@/admin/ui/bucket'
import { StageControl } from '@/admin/ui/stage-control'
import { PIPELINE_STAGES, REGIONS } from '@/sanity/portal/office-constants'

export const metadata = { title: 'Projects' }

type Project = Awaited<ReturnType<typeof listProjects>>[number]

/** A section's projects grouped under each client, A to Z. */
function clientsOf(list: Project[]) {
  const groups = new Map<string, { key: string; name: string; clientId?: string; items: Project[] }>()
  for (const p of list) {
    const key = p.client._id || p.client.organizationName || 'none'
    const g = groups.get(key) ?? { key, name: p.client.organizationName || 'No client', clientId: p.client._id || undefined, items: [] }
    g.items.push(p)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function ClientGroups({ id, list }: { id: string; list: Project[] }) {
  return (
    <>
      {clientsOf(list).map(({ key, name, clientId, items }) => (
        <Bucket key={key} id={`${id}:${key}`} title={name} count={items.length} closed nested>
          {clientId && <Link className="text-link small a-client-link" href={`/admin/clients/${clientId}`}>Client page</Link>}
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Region</th>
                  <th scope="col">Next date</th>
                  <th scope="col" className="num">Quote</th>
                  <th scope="col" className="a-stage-col">Stage</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const next = MILESTONE_LIST.filter((m) => p.milestones[m.key] && stageIndex(p.pipelineStage) < stageIndex(m.doneFrom))
                    .map((m) => ({ label: m.label, date: p.milestones[m.key]! }))
                    .concat(p.schedule.map((x) => ({ label: x.title, date: x.start })))
                    .sort((a, b) => a.date.localeCompare(b.date))[0]
                  return (
                    <tr key={p._id}>
                      <td><Link className="a-strong-link" href={`/admin/projects/${p._id}`}>{p.title}</Link></td>
                      <td>{REGIONS.find((r) => r.value === p.region)?.title ?? '—'}</td>
                      <td>{p.declinedAt ? `Declined · ${fmtDay(p.declinedAt.slice(0, 10))}` : next ? `${next.label} · ${fmtDay(next.date)}` : '—'}</td>
                      <td className="num">{p.quoteAmount ? cad(p.quoteAmount) : '—'}</td>
                      <td className="a-stage-col">
                        <StageControl compact archived={p.archived} declined={Boolean(p.declinedAt)} projectId={p._id} projectTitle={p.title} current={p.pipelineStage} stages={PIPELINE_STAGES.map((s) => ({ title: s.title, value: s.value }))} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Bucket>
      ))}
    </>
  )
}

const HINTS: Record<string, string> = {
  booked: 'Contract, deposit, dates',
  preproduction: 'Shot list, people, travel',
  shoot: 'On location, then backups',
  roughcut: 'First cut and round 1',
  finalcut: 'Final cut and round 2',
  delivered: 'Finals out, invoice',
  paid: 'Thank-you, then archive',
}
const STAGES = PIPELINE_STAGES.map((s) => ({ title: s.title as string, value: s.value as string }))

export default async function Projects({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAdmin()
  const [projects, sp] = await Promise.all([listProjects(), searchParams])
  const list = sp.view === 'list'
  const live = projects.filter((p) => !p.archived)
  const board = live.filter((p) => stageIndex(p.pipelineStage) >= stageIndex('booked'))
  const active = live.filter(isActive)
  const soon = nextTwoWeeks(projects)
  const needs = needsAction(board).length
  const early = live.length - board.length
  return (
    <div className={`a-page${list ? '' : ' a-page-wide'}`}>
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">Booked to paid</span>
          <h1 className="a-h1">Projects</h1>
        </div>
        <div className="btn-row">
          <div className="a-switch" role="group" aria-label="View">
            <Link href="/admin/projects" aria-current={list ? undefined : 'page'}>Board</Link>
            <Link href="/admin/projects?view=list" aria-current={list ? 'page' : undefined}>List and archive</Link>
          </div>
          <a className="btn btn-primary" href="/studio/portal/intent/create/template=clientProject;type=clientProject" target="_blank" rel="noopener noreferrer">
            New project<span className="sr-only"> (opens the Studio)</span>
          </a>
        </div>
      </header>

      {!list && (
        <>
          <section aria-label="At a glance" className="a-kpis">
            <div className="a-kpi">
              <span className="a-kpi-label">In production</span>
              <span className="a-kpi-num">{cad(active.reduce((n, p) => n + (p.quoteAmount ?? 0), 0))}</span>
              <span className="a-kpi-note">{active.length} active project{active.length === 1 ? '' : 's'}</span>
            </div>
            <div className="a-kpi">
              <span className="a-kpi-label">Shoots, next 14 days</span>
              <span className="a-kpi-num">{soon.shoots}</span>
              <span className="a-kpi-note">From the shoot dates you set</span>
            </div>
            <div className="a-kpi">
              <span className="a-kpi-label">Deliveries, next 14 days</span>
              <span className="a-kpi-num">{soon.deliveries}</span>
              <span className="a-kpi-note">From the delivery dates you set</span>
            </div>
            <div className={`a-kpi${needs ? ' is-hot' : ''}`}>
              <span className="a-kpi-label">Need you</span>
              <span className={`a-kpi-num${needs ? ' a-accent' : ''}`}>{needs}</span>
              <span className="a-kpi-note">{needs ? <Link className="text-link" href="/admin">See them on the dashboard</Link> : 'Nothing waiting on you'}</span>
            </div>
          </section>
          <Board
            cards={board.map(boardCard)}
            stages={STAGES}
            empty="Nothing here"
            perRow={4}
            columns={STAGES.filter((s) => stageIndex(s.value) >= stageIndex('booked')).map((s) => ({ ...s, hint: HINTS[s.value] ?? ''}))}
          />
          {early > 0 && <p className="muted small" style={{ margin: 0 }}>{early} lead{early === 1 ? '' : 's'} and quote{early === 1 ? '' : 's'} not booked yet: <Link className="text-link" href="/admin/leads">open the Leads board</Link>.</p>}
        </>
      )}

      {list && [

        ...PIPELINE_STAGES.map((s) => ({ id: s.value as string, title: s.title as string, list: projects.filter((p) => !p.archived && p.pipelineStage === s.value) })),
        { id: 'archived', title: 'Archived', list: projects.filter((p) => p.archived) },
      ].map(({ id, title, list }) => {
        if (!list.length) return null
        return (
          <Bucket key={id} id={id} title={title} count={list.length} closed={id === 'delivered' || id === 'paid' || id === 'archived'}>
            {id === 'archived' ? (
              ([['completed', 'Completed', list.filter((p) => !p.declinedAt)], ['declined', 'Declined', list.filter((p) => p.declinedAt)]] as const).map(([key, label, sub]) =>
                sub.length ? (
                  <section key={key} className="a-archive-group" aria-label={`${label} projects`}>
                    <h3 className="eyebrow a-archive-head">{label} <span className="muted">{sub.length}</span></h3>
                    <ClientGroups id={`archived-${key}`} list={[...sub]} />
                  </section>
                ) : null,
              )
            ) : (
              <ClientGroups id={id} list={list} />
            )}
          </Bucket>
        )
      })}
      {!projects.length && <p className="muted">No projects yet. Add one in the Studio and it shows up here.</p>}
    </div>
  )
}
