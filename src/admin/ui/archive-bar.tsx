import Link from 'next/link'
import { fmtDay } from '@/admin/dates'
import { cad } from '@/admin/insights'
import { stageTitle } from '@/admin/stages'
import type { OfficeProject } from '@/admin/types'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'
import { Bucket } from './bucket'
import { StageControl } from './stage-control'

const STAGES = PIPELINE_STAGES.map((s) => ({ title: s.title as string, value: s.value as string }))

/** The collapsible Archive bar under a board: completed and declined projects, each with a way back. */
export function ArchiveBar({ id, list, title = 'Archive', empty = 'Nothing archived yet.' }: { id: string; list: OfficeProject[]; title?: string; empty?: string }) {
  const groups = [
    ['Completed', list.filter((p) => !p.declinedAt)],
    ['Declined', list.filter((p) => p.declinedAt)],
  ] as const
  return (
    <Bucket id={id} title={title} count={list.length} closed>
      {!list.length && <p className="muted small" style={{ margin: 0 }}>{empty}</p>}
      {groups.map(([label, sub]) =>
        sub.length ? (
          <section key={label} className="a-archive-group" aria-label={`${label} projects`}>
            <h3 className="eyebrow a-archive-head">{label} <span className="muted">{sub.length}</span></h3>
            <div className="a-table-scroll">
              <table className="a-table">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Client</th>
                    <th scope="col">Was in</th>
                    <th scope="col" className="num">Quote</th>
                    <th scope="col" className="a-stage-col">Bring back</th>
                  </tr>
                </thead>
                <tbody>
                  {sub.map((p) => (
                    <tr key={p._id}>
                      <td><Link className="a-strong-link" href={`/admin/projects/${p._id}`}>{p.title}</Link></td>
                      <td>{p.client.organizationName}</td>
                      <td>{stageTitle(p.pipelineStage)}{p.declinedAt ? ` · declined ${fmtDay(p.declinedAt.slice(0, 10))}` : ''}</td>
                      <td className="num">{p.quoteAmount ? cad(p.quoteAmount) : '—'}</td>
                      <td className="a-stage-col">
                        <StageControl compact archived declined={Boolean(p.declinedAt)} projectId={p._id} projectTitle={p.title} current={p.pipelineStage} stages={STAGES} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null,
      )}
    </Bucket>
  )
}
