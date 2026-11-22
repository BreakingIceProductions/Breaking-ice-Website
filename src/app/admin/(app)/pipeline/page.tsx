import '../../../css/admin-pages.css'
import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { boardCard, pipelineTiles } from '@/admin/board-data'
import { listProjects } from '@/admin/data'
import { cad } from '@/admin/insights'
import { stageIndex } from '@/admin/stages'
import { ArchiveBar } from '@/admin/ui/archive-bar'
import { Board } from '@/admin/ui/board'
import { SplitBar } from '@/admin/ui/graphics'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'

export const metadata = { title: 'Pipeline' }

const GROUP = { sales: 'Sales', production: 'Production' }
const STAGES = PIPELINE_STAGES.map((s) => ({ title: s.title as string, value: s.value as string }))
const COLUMNS = PIPELINE_STAGES.map((s) => ({ title: s.title as string, value: s.value as string, hint: s.hint as string, group: GROUP[s.group] }))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Every lead and project on one board: the sales columns, then the production ones. */
export default async function Pipeline() {
  await requireAdmin()
  const projects = await listProjects()
  const cards = projects.filter((p) => !p.archived).map(boardCard)
  const archived = projects.filter((p) => p.archived)
  const won = (p: (typeof projects)[number]) => stageIndex(p.pipelineStage) >= stageIndex('booked')
  const cold = cards.filter((c) => c.cold).length
  const t = pipelineTiles(projects)
  const toWrite = cards.filter((c) => c.stage === 'proposal').length
  const quoted = cards.filter((c) => c.stage === 'quoted').length
  return (
    <div className="a-page a-page-wide pl-page">
      <header className="a-head">
        <div className="stack ap-gap-3">
          <h1 className="a-h1">Pipeline</h1>
          <p className="muted m0">
            Every lead and every project, from new lead to paid.<span className="a-hint-desktop"> Drag a card to move it.</span>
          </p>
        </div>
        <div className="btn-row">
          <div className="a-switch" role="group" aria-label="View">
            <Link href="/admin/pipeline" aria-current="page">Board</Link>
            <Link href="/admin/projects?view=list">List</Link>
          </div>
          <Link className="btn btn-secondary" href="/admin/proposals/new">Quote builder</Link>
          <Link className="btn btn-primary" href="/admin/leads/new">New lead</Link>
        </div>
      </header>

      <Board
        cards={cards}
        stages={STAGES}
        columns={COLUMNS}
        empty="Nobody here"
        archive={
          <div className="bd-archives">
            <ArchiveBar id="leads-archive" title="Archive" empty="No lost or declined leads and quotes yet." list={archived.filter((p) => !won(p))} />
            <ArchiveBar id="board-archive" title="Archived projects" empty="No archived projects yet." list={archived.filter(won)} />
          </div>
        }
      />

      <section aria-labelledby="going-h" className="stack ap-gap-4">
        <h2 id="going-h" className="a-h2">How it’s going</h2>
        <div className="a-kpis">
          <div className="a-kpi">
            <span className="a-kpi-label">Quotes in play</span>
            <span className="a-kpi-num">{cad(t.inPlay.sum)}</span>
            <span className="a-kpi-note">{plural(t.inPlay.count, 'quote')} to write or out{t.inPlay.missing ? `, ${t.inPlay.missing} without a total` : ''}</span>
            {toWrite + quoted > 0 && <SplitBar parts={[{ label: 'To write', value: toWrite, text: String(toWrite), tone: 'soft' }, { label: 'Out', value: quoted, text: String(quoted), tone: 'accent' }]} />}
          </div>
          <div className="a-kpi">
            <span className="a-kpi-label">Win rate, last 90 days</span>
            <span className="a-kpi-num">{t.win ? `${t.win.rate}%` : '—'}</span>
            <span className="a-kpi-note">{t.win ? `${t.win.won} booked, ${t.win.lost} declined` : 'Nothing booked or declined yet'}</span>
            {t.win && <SplitBar parts={[{ label: 'Booked', value: t.win.won, text: String(t.win.won), tone: 'accent' }, { label: 'Declined', value: t.win.lost, text: String(t.win.lost), tone: 'soft' }]} />}
          </div>
          <div className="a-kpi">
            <span className="a-kpi-label">In production</span>
            <span className="a-kpi-num">{cad(t.production.sum)}</span>
            <span className="a-kpi-note">{plural(t.production.count, 'project')}, Onboarding to Final delivery</span>
          </div>
          <div className="a-kpi">
            <span className="a-kpi-label">Waiting on deposit</span>
            <span className="a-kpi-num">{t.waitingOnDeposit}</span>
            <span className="a-kpi-note">In Onboarding with no paid deposit invoice</span>
          </div>
          <div className={`a-kpi${cold ? ' is-hot' : ''}`}>
            <span className="a-kpi-label">Going cold</span>
            <span className="a-kpi-num">{cold}</span>
            <span className="a-kpi-note">New lead 3+ days, call or quote to write 5+, quoted 7+</span>
          </div>
          <div className="a-kpi">
            <span className="a-kpi-label">Shoots, next 14 days</span>
            <span className="a-kpi-num">{t.shoots}</span>
            <span className="a-kpi-note">From the shoot dates you set</span>
          </div>
        </div>
      </section>
    </div>
  )
}
