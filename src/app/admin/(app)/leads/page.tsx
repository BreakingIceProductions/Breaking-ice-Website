import '../../../css/admin-pages.css'
import '../../../css/admin-simple-a.css'
import '../../../css/admin-simple-b.css'
import '../../../css/admin-simple-c.css'
import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { leadCard, pipelineTiles, recentlyWon, type LastMail } from '@/admin/board-data'
import { listProjects } from '@/admin/data'
import { fmtDate } from '@/admin/dates'
import { listConversations, mailState } from '@/admin/gmail'
import { cad } from '@/admin/insights'
import { isSalesStage, LEAD_COLUMNS, leadColumnTitle, LOST_REASONS } from '@/admin/lead'
import { stageTitle } from '@/admin/stages'
import { Board } from '@/admin/ui/board'
import { Bucket } from '@/admin/ui/bucket'
import { HelpTip } from '@/admin/ui/help-tip'
import { StageControl } from '@/admin/ui/stage-control'

export const metadata = { title: 'Leads & Quotes' }

const COLUMNS = LEAD_COLUMNS.map((c) => ({ title: c.title as string, value: c.value as string, hint: c.hint as string }))
// The card window's steps and stage menu also offer Onboarding: moving there books the job and it moves to Projects.
const STAGES = [...COLUMNS.map(({ title, value }) => ({ title, value })), { title: stageTitle('booked'), value: 'booked' }]
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * The newest email with each client's people, from the same list the Emails page shows (cached there for a minute
 * and a half). Only used to tell whether they wrote last. Gmail not connected, slow or failing: the cards go by the
 * calls and emails logged on each lead instead.
 */
async function lastMail(): Promise<Map<string, LastMail>> {
  try {
    const state = await mailState()
    if (state !== 'ready' && state !== 'sample') return new Map()
    const rows = await Promise.race([listConversations(), new Promise<null>((r) => setTimeout(() => r(null), 4000))])
    return new Map((rows ?? []).filter((r) => r.last).map((r) => [r.clientId, { at: r.last!.at, mine: r.last!.mine }]))
  } catch (e) {
    console.error('[leads] last emails failed', e)
    return new Map()
  }
}

/** Everyone who has got in touch, from first hello to a quote out. Once a quote is signed the job moves to Projects. */
export default async function Leads() {
  const admin = await requireAdmin()
  const [projects, mail] = await Promise.all([listProjects(), admin.viewOnly ? Promise.resolve(new Map<string, LastMail>()) : lastMail()])
  const open = projects.filter((p) => !p.archived && isSalesStage(p.pipelineStage))
  const cards = open.map((p) => leadCard(p, mail.get(p.client._id)))
  const lost = projects.filter((p) => p.archived && isSalesStage(p.pipelineStage)).sort((a, b) => (b.declinedAt ?? b._updatedAt ?? '').localeCompare(a.declinedAt ?? a._updatedAt ?? ''))
  const won = recentlyWon(projects)
  const t = pipelineTiles(projects)
  const waiting = cards.filter((c) => c.spoke?.waiting).length

  return (
    <div className="a-page a-page-wide pl-page">
      <header className="a-head">
        <div className="sc-title">
          <h1 className="a-h1">Leads &amp; Quotes</h1>
          <HelpTip label="About this board">
            Everyone who has got in touch, until they sign. Drag a card to another column to move it, or open it and use its stage menu. Every move shows a preview first. A copper line means it’s your turn: they wrote last, or it’s been quiet long enough to follow up (3 days for a new lead, 5 while talking or quoting, 7 once quoted). When a quote is signed the job moves to Projects by itself.
          </HelpTip>
        </div>
        <Link className="btn sa-copper" href="/admin/leads/new">New lead</Link>
      </header>

      <Board cards={cards} stages={STAGES} columns={COLUMNS} empty="Nobody here" leads />

      <Bucket id="leads-won-lost" title="Won and lost" count={won.length + lost.length} closed>
        <section className="a-archive-group" aria-labelledby="ls-won-h">
          <h3 id="ls-won-h" className="eyebrow a-archive-head">Won, now projects <span className="muted">{won.length}</span></h3>
          {won.length ? (
            <ul className="ls-won">
              {won.map(({ p, at }) => (
                <li key={p._id}>
                  <span><Link className="a-strong-link" href={`/admin/projects/${encodeURIComponent(p._id)}`}>{p.title}</Link> <span className="muted">· {p.client.organizationName}</span></span>
                  <span className="muted">Won {fmtDate(at)}{p.quoteAmount ? ` · ${cad(p.quoteAmount)}` : ''} · now in {stageTitle(p.pipelineStage)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Nothing won in the last 60 days.</p>
          )}
        </section>
        <section className="a-archive-group" aria-labelledby="ls-lost-h">
          <h3 id="ls-lost-h" className="eyebrow a-archive-head">Lost or archived <span className="muted">{lost.length}</span></h3>
          {lost.length ? (
            <div className="a-table-scroll">
              <table className="a-table">
                <thead>
                  <tr>
                    <th scope="col">Lead</th>
                    <th scope="col">Company</th>
                    <th scope="col">Why</th>
                    <th scope="col" className="num">Quote</th>
                    <th scope="col" className="a-stage-col">Bring back</th>
                  </tr>
                </thead>
                <tbody>
                  {lost.map((p) => {
                    const reason = LOST_REASONS.find((r) => r.value === p.office.lead?.lostReason)?.title ?? (p.declinedAt ? 'Declined' : 'Archived')
                    return (
                      <tr key={p._id}>
                        <td><Link className="a-strong-link" href={`/admin/leads/${encodeURIComponent(p._id)}`}>{p.title}</Link></td>
                        <td>{p.client.organizationName}</td>
                        <td>{reason}{p.declinedAt ? ` · ${fmtDate(p.declinedAt)}` : ''} <span className="muted">· was in {leadColumnTitle(p.pipelineStage)}</span></td>
                        <td className="num">{p.quoteAmount ? cad(p.quoteAmount) : '—'}</td>
                        <td className="a-stage-col">
                          <StageControl compact archived declined={Boolean(p.declinedAt)} projectId={p._id} projectTitle={p.title} current={p.pipelineStage} stages={STAGES} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted small m0">No lost or archived leads yet.</p>
          )}
        </section>
      </Bucket>

      <section aria-labelledby="going-h" className="sc-going">
        <h2 id="going-h" className="sr-only">How it’s going</h2>
        <ul className="sc-going-list">
          <li className={waiting ? 'is-hot' : undefined} title="They wrote last, or it’s time to follow up"><strong>{waiting}</strong> waiting on you</li>
          <li title={`${plural(t.inPlay.count, 'quote')} to write or out${t.inPlay.missing ? `, ${t.inPlay.missing} without a total` : ''}`}><strong>{cad(t.inPlay.sum)}</strong> in play</li>
          {t.win && <li title={`${t.win.won} signed, ${t.win.lost} declined, last 90 days`}><strong>{t.win.rate}%</strong> won</li>}
          <li title="Open leads on the board"><strong>{cards.length}</strong> open {cards.length === 1 ? 'lead' : 'leads'}</li>
        </ul>
        <Link className="text-link small" href="/admin/pipeline">Projects<span aria-hidden="true"> →</span></Link>
      </section>
    </div>
  )
}
