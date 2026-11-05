import { requireAdmin } from '@/admin/auth'
import Link from 'next/link'
import { listProjects } from '@/admin/data'
import { fmtDay } from '@/admin/dates'
import { cad } from '@/admin/insights'
import { MILESTONE_LIST } from '@/admin/milestones'
import { stageIndex } from '@/admin/stages'
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

export default async function Projects() {
  await requireAdmin()
  const projects = await listProjects()
  return (
    <div className="a-page">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">Pipeline</span>
          <h1 className="a-h1">Projects</h1>
        </div>
        <a className="btn btn-primary" href="/studio/portal/intent/create/template=clientProject;type=clientProject" target="_blank" rel="noopener noreferrer">
          New project<span className="sr-only"> (opens the Studio)</span>
        </a>
      </header>
      {[
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
