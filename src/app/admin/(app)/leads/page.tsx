import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { boardCard, winRate } from '@/admin/board-data'
import { listProjects } from '@/admin/data'
import { daysSince } from '@/admin/dates'
import { cad } from '@/admin/insights'
import { stageIndex } from '@/admin/stages'
import { ArchiveBar } from '@/admin/ui/archive-bar'
import { Board } from '@/admin/ui/board'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'

export const metadata = { title: 'Leads' }

const STAGES = PIPELINE_STAGES.map((s) => ({ title: s.title as string, value: s.value as string }))

export default async function Leads() {
  await requireAdmin()
  const projects = await listProjects()
  const live = projects.filter((p) => !p.archived)
  const leads = live.filter((p) => p.pipelineStage === 'lead')
  const quoted = live.filter((p) => p.pipelineStage === 'quoted')
  // Just booked stays on this board for a month, so there's somewhere to drag a quote that said yes.
  const booked = live.filter((p) => p.pipelineStage === 'booked' && (daysSince(p.office.stageChangedAt) ?? 99) <= 30)
  const cards = [...leads, ...quoted, ...booked].map(boardCard)
  const cold = cards.filter((c) => c.cold).length
  const win = winRate(projects)
  const missing = quoted.filter((p) => !p.quoteAmount).length
  return (
    <div className="a-page a-page-wide">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">Before they sign</span>
          <h1 className="a-h1">Leads</h1>
        </div>
        <div className="btn-row">
          <Link className="btn btn-secondary" href="/admin/proposals/new">Proposal builder</Link>
          <a className="btn btn-primary" href="/studio/portal/intent/create/template=clientProject;type=clientProject" target="_blank" rel="noopener noreferrer">
            New lead<span className="sr-only"> (opens the Studio)</span>
          </a>
        </div>
      </header>

      <section aria-label="How it's going" className="a-kpis">
        <div className="a-kpi">
          <span className="a-kpi-label">Open pipeline</span>
          <span className="a-kpi-num">{cad(quoted.reduce((n, p) => n + (p.quoteAmount ?? 0), 0))}</span>
          <span className="a-kpi-note">{quoted.length} quote{quoted.length === 1 ? '' : 's'} out{missing ? `, ${missing} without a total` : ''}</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">New leads</span>
          <span className="a-kpi-num">{leads.length}</span>
          <span className="a-kpi-note">Waiting on a reply or a quote</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Win rate, last 90 days</span>
          <span className="a-kpi-num">{win ? `${win.rate}%` : '—'}</span>
          <span className="a-kpi-note">{win ? `${win.won} booked, ${win.lost} declined` : 'Nothing booked or declined yet'}</span>
        </div>
        <div className={`a-kpi${cold ? ' is-hot' : ''}`}>
          <span className="a-kpi-label">Going cold</span>
          <span className={`a-kpi-num${cold ? ' a-accent' : ''}`}>{cold}</span>
          <span className="a-kpi-note">Leads 3+ days, quotes 7+ days</span>
        </div>
      </section>

      <Board
        cards={cards}
        stages={STAGES}
        empty="Nobody here"
        archive={<ArchiveBar id="leads-archive" list={projects.filter((p) => p.archived && stageIndex(p.pipelineStage) < stageIndex('booked'))} />}
        columns={[
          { title: 'Lead', value: 'lead', hint: 'Reply and book a call' },
          { title: 'Quoted', value: 'quoted', hint: 'Quote written or out with them' },
          { title: 'Booked', value: 'booked', hint: 'Said yes in the last 30 days' },
        ]}
      />
      <p className="muted small" style={{ margin: 0 }}>Once a job is booked it lives on the <Link className="text-link" href="/admin/projects">Projects board</Link>. Archived leads and quotes don’t count toward the pipeline.</p>
    </div>
  )
}
