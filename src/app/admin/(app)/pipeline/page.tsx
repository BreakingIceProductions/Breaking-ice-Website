import '../../../css/admin-pages.css'
import '../../../css/admin-simple-a.css'
import '../../../css/admin-simple-b.css'
import '../../../css/admin-simple-c.css'
import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { boardCard, pipelineTiles } from '@/admin/board-data'
import { listProjects } from '@/admin/data'
import { cad } from '@/admin/insights'
import { isSalesStage } from '@/admin/lead'
import { ArchiveBar } from '@/admin/ui/archive-bar'
import { Board } from '@/admin/ui/board'
import { HelpTip } from '@/admin/ui/help-tip'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'

export const metadata = { title: 'Projects' }

// Leads have their own board (Leads & Quotes); this one starts at Onboarding.
const PRODUCTION = PIPELINE_STAGES.filter((s) => s.group === 'production')
const STAGES = PRODUCTION.map((s) => ({ title: s.title as string, value: s.value as string }))
const COLUMNS = PRODUCTION.map((s) => ({ title: s.title as string, value: s.value as string, hint: s.hint as string }))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Booked work on one board, Onboarding to Paid. Leads and quotes live on their own board until they sign. */
export default async function Pipeline() {
  await requireAdmin()
  const all = await listProjects()
  const projects = all.filter((p) => !isSalesStage(p.pipelineStage))
  const cards = projects.filter((p) => !p.archived).map(boardCard)
  const archived = projects.filter((p) => p.archived)
  const t = pipelineTiles(all)
  return (
    <div className="a-page a-page-wide pl-page">
      <header className="a-head">
        <div className="sc-title">
          <h1 className="a-h1">Projects</h1>
          <HelpTip label="About the board">Booked work, from Onboarding to Paid. Drag a card to another column to move it, or open it and use its stage menu. Every move shows a preview first. Drop a card on the Archive bar to file it away. Leads and quotes are on <Link className="text-link" href="/admin/leads">Leads &amp; Quotes</Link> until they sign.</HelpTip>
        </div>
        <div className="btn-row">
          <div className="a-switch" role="group" aria-label="View">
            <Link href="/admin/pipeline" aria-current="page">Board</Link>
            <Link href="/admin/projects?view=list">List</Link>
          </div>
          <Link className="btn sa-copper" href="/admin/projects/new">New project</Link>
        </div>
      </header>

      <Board
        cards={cards}
        stages={STAGES}
        columns={COLUMNS}
        empty="Nobody here"
        archive={
          <div className="bd-archives">
            <ArchiveBar id="board-archive" title="Archived projects" empty="No archived projects yet." list={archived} />
          </div>
        }
      />

      {/* The money side lives on Money; here it's one quiet row of the numbers, with a link there. */}
      <section aria-labelledby="going-h" className="sc-going">
        <h2 id="going-h" className="sr-only">How it’s going</h2>
        <ul className="sc-going-list">
          <li title={`${plural(t.production.count, 'project')}, Onboarding to Final delivery`}><strong>{cad(t.production.sum)}</strong> in production</li>
          <li title="In Onboarding with no paid deposit invoice"><strong>{t.waitingOnDeposit}</strong> waiting on deposit</li>
          <li title="From the shoot dates you set"><strong>{t.shoots}</strong> {t.shoots === 1 ? 'shoot' : 'shoots'} in 14 days</li>
        </ul>
        <Link className="text-link small" href="/admin/money">Money<span aria-hidden="true"> →</span></Link>
      </section>
    </div>
  )
}
