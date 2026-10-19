import Link from 'next/link'
import { listProjects } from '@/admin/data'
import { fmtDay } from '@/admin/dates'
import { cad } from '@/admin/insights'
import { MILESTONE_LIST } from '@/admin/milestones'
import { stageIndex } from '@/admin/stages'
import { PIPELINE_STAGES, REGIONS } from '@/sanity/portal/office-constants'

export const metadata = { title: 'Projects' }

export default async function Projects() {
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
      {PIPELINE_STAGES.map((s) => {
        const list = projects.filter((p) => p.pipelineStage === s.value)
        if (!list.length) return null
        return (
          <section key={s.value} className="p-card" aria-labelledby={`h-${s.value}`}>
            <div className="a-card-head">
              <h2 id={`h-${s.value}`} className="a-h2">{s.title}</h2>
              <span className="muted small">{list.length}</span>
            </div>
            <div className="a-table-scroll">
              <table className="a-table">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Client</th>
                    <th scope="col">Region</th>
                    <th scope="col">Next date</th>
                    <th scope="col" className="num">Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const next = MILESTONE_LIST.filter((m) => p.milestones[m.key] && stageIndex(p.pipelineStage) < stageIndex(m.doneFrom))
                      .map((m) => ({ label: m.label, date: p.milestones[m.key]! }))
                      .concat(p.schedule.map((x) => ({ label: x.title, date: x.start })))
                      .sort((a, b) => a.date.localeCompare(b.date))[0]
                    return (
                      <tr key={p._id}>
                        <td><Link className="a-strong-link" href={`/admin/projects/${p._id}`}>{p.title}</Link></td>
                        <td>{p.client.organizationName}</td>
                        <td>{REGIONS.find((r) => r.value === p.region)?.title ?? '—'}</td>
                        <td>{next ? `${next.label} · ${fmtDay(next.date)}` : '—'}</td>
                        <td className="num">{p.quoteAmount ? cad(p.quoteAmount) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
      {!projects.length && <p className="muted">No projects yet. Add one in the Studio and it shows up here.</p>}
    </div>
  )
}
