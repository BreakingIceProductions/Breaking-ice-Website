import Link from 'next/link'
import { PendingLink } from '@/admin/ui/pending-link'
import { redirect } from 'next/navigation'
import '../../../css/admin-pages.css'
import '../../../css/admin-simple-a.css'
import '../../../css/admin-simple-b.css'
import '../../../css/admin-simple-c.css'
import { requireAdmin } from '@/admin/auth'
import { listProjects } from '@/admin/data'
import { fmtDate } from '@/admin/dates'
import { isSalesStage } from '@/admin/lead'
import { cad } from '@/admin/insights'
import { MILESTONE_LIST } from '@/admin/milestones'
import { stageIndex } from '@/admin/stages'
import { StageControl } from '@/admin/ui/stage-control'
import { MiniStage } from '@/admin/ui/viz-c'
import { PIPELINE_STAGES, REGIONS } from '@/sanity/portal/office-constants'

export const metadata = { title: 'All projects' }

type Project = Awaited<ReturnType<typeof listProjects>>[number]
type Props = { searchParams: Promise<{ view?: string; stage?: string; show?: string; sort?: string }> }

const SORTS = { stage: 'Stage', project: 'Project', client: 'Client', quote: 'Quote' } as const
type Sort = keyof typeof SORTS

/** The next dated thing on a project: a milestone not reached yet, or a schedule item. */
function nextDate(p: Project) {
  return MILESTONE_LIST.filter((m) => p.milestones[m.key] && stageIndex(p.pipelineStage) < stageIndex(m.doneFrom))
    .map((m) => ({ label: m.label, date: p.milestones[m.key]! }))
    .concat(p.schedule.map((x) => ({ label: x.title, date: x.start })))
    .sort((a, b) => a.date.localeCompare(b.date))[0]
}

/** Every booked project in one flat table: filter by stage, switch to the archive, sort by a column. The board is on Pipeline. */
export default async function Projects({ searchParams }: Props) {
  await requireAdmin()
  const sp = await searchParams
  // The board lives on the Projects board (/admin/pipeline); only the list and archive live here.
  if (sp.view !== 'list') redirect('/admin/pipeline')
  // Leads, open or lost, are on Leads & Quotes; this list is booked work.
  const projects = (await listProjects()).filter((p) => !isSalesStage(p.pipelineStage))
  const archived = sp.show === 'archived'
  const stage = !archived && PIPELINE_STAGES.some((s) => s.value === sp.stage) ? sp.stage : undefined
  const sort: Sort = sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : 'stage'

  const live = projects.filter((p) => !p.archived)
  const pool = archived ? projects.filter((p) => p.archived) : live
  const byClient = (a: Project, b: Project) => (a.client.organizationName || '').localeCompare(b.client.organizationName || '')
  const shown = pool
    .filter((p) => !stage || p.pipelineStage === stage)
    .sort((a, b) =>
      sort === 'project'
        ? a.title.localeCompare(b.title)
        : sort === 'client'
          ? byClient(a, b) || a.title.localeCompare(b.title)
          : sort === 'quote'
            ? (b.quoteAmount ?? -1) - (a.quoteAmount ?? -1)
            : stageIndex(a.pipelineStage) - stageIndex(b.pipelineStage) || byClient(a, b),
    )

  const href = (q: { stage?: string; show?: string; sort?: string }) => {
    const u = new URLSearchParams({ view: 'list' })
    if (q.show) u.set('show', q.show)
    if (q.stage) u.set('stage', q.stage)
    if (q.sort && q.sort !== 'stage') u.set('sort', q.sort)
    return `/admin/projects?${u}`
  }
  const keep = { stage, show: archived ? 'archived' : undefined }
  const th = (key: Sort, className?: string) => (
    <th scope="col" className={className} aria-sort={sort === key ? (key === 'quote' ? 'descending' : 'ascending') : undefined}>
      <PendingLink className="ap-sort" href={href({ ...keep, sort: key })} scroll={false} data-on={sort === key ? '' : undefined}>
        {SORTS[key]}
        <span className="ap-arrow" aria-hidden="true">{key === 'quote' ? '↓' : '↑'}</span>
        {sort !== key && <span className="sr-only">, sort by this column</span>}
      </PendingLink>
    </th>
  )

  return (
    <div className="a-page">
      <header className="a-head">
        <h1 className="a-h1">All projects</h1>
        <div className="btn-row">
          <div className="a-switch" role="group" aria-label="View">
            <Link href="/admin/pipeline">Board</Link>
            <Link href="/admin/projects?view=list" aria-current="page">List</Link>
          </div>
          <Link className="btn sa-copper" href="/admin/projects/new">New project</Link>
        </div>
      </header>

      <nav className="ap-filters" aria-label="Filter projects">
        <PendingLink className="ap-filter" href={href({ sort })} aria-current={!archived && !stage ? 'true' : undefined} scroll={false}>
          All <span className="ap-count">{live.length}</span>
        </PendingLink>
        {PIPELINE_STAGES.map((s) => {
          const n = live.filter((p) => p.pipelineStage === s.value).length
          if (!n) return null
          return (
            <PendingLink key={s.value} className="ap-filter" href={href({ stage: s.value, sort })} aria-current={stage === s.value ? 'true' : undefined} scroll={false}>
              {s.title} <span className="ap-count">{n}</span>
            </PendingLink>
          )
        })}
        <PendingLink className="ap-filter" href={href({ show: 'archived', sort })} aria-current={archived ? 'true' : undefined} scroll={false}>
          Archived <span className="ap-count">{projects.length - live.length}</span>
        </PendingLink>
      </nav>

      {shown.length ? (
        <div className="p-card">
          <div className="a-table-scroll">
            <table className="a-table ap-table sc-ptable">
              <caption className="sr-only">{archived ? 'Archived projects' : stage ? `Projects in ${PIPELINE_STAGES.find((s) => s.value === stage)?.title}` : 'All live projects'}, sorted by {SORTS[sort].toLowerCase()}</caption>
              <thead>
                <tr>
                  {th('project')}
                  {th('client')}
                  <th scope="col">Next date</th>
                  {th('quote', 'num')}
                  {th('stage', 'a-stage-col')}
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const next = nextDate(p)
                  const region = REGIONS.find((r) => r.value === p.region)?.title
                  return (
                    <tr key={p._id}>
                      <td className="sc-pt-title">
                        <Link className="a-strong-link" href={`/admin/projects/${p._id}`} title={region}>{p.title}</Link>
                      </td>
                      <td className="sc-pt-client">{p.client._id ? <Link className="text-link-plain" href={`/admin/clients/${p.client._id}`}>{p.client.organizationName}</Link> : p.client.organizationName || '—'}</td>
                      <td className="sc-pt-next">
                        {p.declinedAt ? (
                          <span className="sa-chip is-past" title={`Declined · ${fmtDate(p.declinedAt)}`}>Declined {fmtDate(p.declinedAt)}</span>
                        ) : next ? (
                          <span className="sa-chip" title={`${next.label} · ${fmtDate(next.date)}`}><span className="sc-pt-date">{fmtDate(next.date)}</span><span className="sc-pt-what">{next.label}</span></span>
                        ) : (
                          <span className="sa-muted" aria-label="No date">—</span>
                        )}
                      </td>
                      <td className="num sc-pt-quote">{p.quoteAmount ? cad(p.quoteAmount) : <span aria-label="No quote">—</span>}</td>
                      <td className="a-stage-col sc-pt-stage">
                        <span className="sc-pt-stagecell">
                          <MiniStage stage={p.pipelineStage} archived={p.archived} declined={Boolean(p.declinedAt)} />
                          {/* Changing the stage is one press away, and on the project page. */}
                          <details className="sc-menu">
                            <summary className="sc-menu-btn" aria-label={`Change the stage of ${p.title}`} title="Change the stage"><span aria-hidden="true">⋯</span></summary>
                            <div className="sc-menu-pop">
                              <StageControl compact archived={p.archived} declined={Boolean(p.declinedAt)} projectId={p._id} projectTitle={p.title} current={p.pipelineStage} stages={PIPELINE_STAGES.map((s) => ({ title: s.title, value: s.value }))} />
                            </div>
                          </details>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-card">
          <p className="a-empty m0">
            {!projects.length ? (
              <>No projects yet. A lead becomes a project when its quote is signed; see <Link className="text-link" href="/admin/leads">Leads &amp; Quotes</Link>.</>
            ) : archived ? (
              'Nothing archived yet.'
            ) : (
              <>Nothing in this stage. <Link className="text-link" href={href({ sort })}>Show all projects</Link>.</>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
