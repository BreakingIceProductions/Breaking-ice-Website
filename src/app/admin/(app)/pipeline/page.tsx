import '../../../css/admin-pages.css'
import '../../../css/admin-simple-a.css'
import '../../../css/admin-simple-b.css'
import '../../../css/admin-simple-c.css'
import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { boardCard, pipelineTiles } from '@/admin/board-data'
import { listProjects } from '@/admin/data'
import { cad } from '@/admin/insights'
import { stageIndex } from '@/admin/stages'
import { ArchiveBar } from '@/admin/ui/archive-bar'
import { Board } from '@/admin/ui/board'
import { HelpTip } from '@/admin/ui/help-tip'
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
  return (
    <div className="a-page a-page-wide pl-page">
      <header className="a-head">
        <div className="sc-title">
          <h1 className="a-h1">Pipeline</h1>
          <HelpTip label="About the board">Drag a card to another column to move it, or open it and use its stage menu. Every move shows a preview first. Drop a card on the Archive bar to file it away. A copper day count means going cold: a new lead after 3 days, a call or quote to write after 5, a quote out after 7.</HelpTip>
        </div>
        <div className="btn-row">
          <div className="a-switch" role="group" aria-label="View">
            <Link href="/admin/pipeline" aria-current="page">Board</Link>
            <Link href="/admin/projects?view=list">List</Link>
          </div>
          <Link className="btn sa-copper" href="/admin/leads/new">New lead</Link>
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

      {/* The money side lives on Money; here it's one quiet row of the numbers, with a link there. */}
      <section aria-labelledby="going-h" className="sc-going">
        <h2 id="going-h" className="sr-only">How it’s going</h2>
        <ul className="sc-going-list">
          <li title={`${plural(t.inPlay.count, 'quote')} to write or out${t.inPlay.missing ? `, ${t.inPlay.missing} without a total` : ''}`}><strong>{cad(t.inPlay.sum)}</strong> in play</li>
          {t.win && <li title={`${t.win.won} booked, ${t.win.lost} declined, last 90 days`}><strong>{t.win.rate}%</strong> won</li>}
          <li title={`${plural(t.production.count, 'project')}, Onboarding to Final delivery`}><strong>{cad(t.production.sum)}</strong> in production</li>
          <li title="In Onboarding with no paid deposit invoice"><strong>{t.waitingOnDeposit}</strong> waiting on deposit</li>
          <li className={cold ? 'is-hot' : undefined} title="New lead 3+ days, call or quote to write 5+, quoted 7+"><strong>{cold}</strong> going cold</li>
          <li title="From the shoot dates you set"><strong>{t.shoots}</strong> {t.shoots === 1 ? 'shoot' : 'shoots'} in 14 days</li>
        </ul>
        <Link className="text-link small" href="/admin/money">Money<span aria-hidden="true"> →</span></Link>
      </section>
    </div>
  )
}
