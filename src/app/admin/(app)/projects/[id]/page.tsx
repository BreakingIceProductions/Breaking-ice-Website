import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProject } from '@/admin/data'
import { fmtDay, fmtRange, today } from '@/admin/dates'
import { ago, cad } from '@/admin/insights'
import { MILESTONE_LIST } from '@/admin/milestones'
import { nextStage, stageIndex, stageTitle } from '@/admin/stages'
import { NoteForm } from '@/admin/ui/note-form'
import { StageControl } from '@/admin/ui/stage-control'
import { SyncButton } from '@/admin/ui/sync-button'
import { invoiceUrl } from '@/admin/xero'
import { DELIVERABLE_LABEL } from '@/portal/ui'
import { PIPELINE_STAGES, PROJECT_TYPES, REGIONS } from '@/sanity/portal/office-constants'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  return { title: (await getProject(id))?.title ?? 'Project' }
}

const studioHref = (id: string) => `/studio/portal/structure/clientProject;${encodeURIComponent(id)}`
const INVOICE_WORD: Record<string, string> = { draft: 'Draft', submitted: 'Awaiting approval', authorised: 'Awaiting payment', paid: 'Paid', voided: 'Voided', deleted: 'Deleted' }

export default async function ProjectPage({ params }: Props) {
  const { id } = await params
  const p = await getProject(id)
  if (!p) notFound()
  const t = today()
  const si = stageIndex(p.pipelineStage)
  const next = p.pipelineStage === 'paid' ? undefined : PIPELINE_STAGES.find((s) => s.value === nextStage(p.pipelineStage))
  const history = new Map((p.office.stageHistory ?? []).map((h) => [h.to, h.at]))
  const invoices = p.office.invoices ?? []
  const deposit = invoices.find((i) => i.kind === 'deposit')
  const final = invoices.find((i) => i.kind === 'final' || i.kind === 'retainer')
  const openDeliverables = p.deliverables.filter((d) => d.status !== 'approved').length
  const round = si >= stageIndex('delivered') ? 3 : si >= stageIndex('finalcut') ? 2 : si >= stageIndex('roughcut') ? 1 : 0

  const dates = [
    ...p.schedule.map((s) => ({ label: s.title + (s.location ? ` · ${s.location}` : ''), value: fmtRange(s.start, s.end), past: (s.end ?? s.start) < t, sort: s.start })),
    ...MILESTONE_LIST.filter((m) => p.milestones[m.key]).map((m) => ({
      label: m.label,
      value: fmtDay(p.milestones[m.key]),
      past: si >= stageIndex(m.doneFrom),
      sort: p.milestones[m.key]!,
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort))

  const feed = [
    ...p.activity.map((a) => ({ at: a.at, text: a.text, source: 'Client portal' })),
    ...(p.office.log ?? []).map((l) => ({ at: l.at, text: l.text, source: 'Back office' })),
    ...(p.office.notes ?? []).map((n) => ({ at: n.at, text: n.text, source: 'Your note' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12)

  return (
    <div className="a-page">
      <nav className="small" aria-label="Breadcrumb">
        <Link className="text-link-plain muted" href="/admin/projects">Projects</Link> <span aria-hidden="true" className="muted">/</span> <span aria-current="page">{p.title}</span>
      </nav>

      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)', minWidth: 0 }}>
          <span className="eyebrow">
            {p.client.organizationName}
            {p.region && ` · ${REGIONS.find((r) => r.value === p.region)?.title}`}
          </span>
          <h1 className="a-h1">{p.title}</h1>
          <div className="row-wrap a-chips">
            {p.projectType && <span className="a-chip">{PROJECT_TYPES.find((x) => x.value === p.projectType)?.title}</span>}
            {p.deliverables.length > 0 && <span className="a-chip">{p.deliverables.length} deliverable{p.deliverables.length === 1 ? '' : 's'}</span>}
            <a className="a-chip a-chip-link" href={studioHref(p._id)} target="_blank" rel="noopener noreferrer">Edit in Studio<span className="sr-only"> (opens in a new tab)</span> ↗</a>
          </div>
        </div>
        <StageControl
          projectId={p._id}
          projectTitle={p.title}
          current={p.pipelineStage}
          next={next ? { title: next.title, value: next.value } : undefined}
          stages={PIPELINE_STAGES.map((s) => ({ title: s.title, value: s.value }))}
        />
      </header>

      <section className="p-card a-stage-card" aria-label={`Stage ${si + 1} of ${PIPELINE_STAGES.length}: ${stageTitle(p.pipelineStage)}`}>
        <ol className="a-stages">
          {PIPELINE_STAGES.map((s, i) => {
            const state = i < si ? 'done' : i === si ? 'current' : 'next'
            const at = history.get(s.value)
            return (
              <li key={s.value} className={state} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="bar" aria-hidden="true" />
                <span className="name">{s.title}</span>
                <span className="when">{state === 'current' ? 'Now' : at ? fmtDay(at.slice(0, 10)) : ''}</span>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="a-split">
        <div className="stack a-col">
          <section className="p-card" aria-labelledby="h-deliv">
            <div className="a-card-head">
              <h2 id="h-deliv" className="a-h2">Deliverables</h2>
              <span className="muted small">{p.deliverables.length ? `${openDeliverables} still open` : 'Add them in the Studio'}</span>
            </div>
            {p.deliverables.length ? (
              <div className="a-table-scroll">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th scope="col">Deliverable</th>
                      <th scope="col">Status</th>
                      <th scope="col">Version</th>
                      <th scope="col" className="num">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.deliverables.map((d) => (
                      <tr key={d._key}>
                        <td><strong>{d.title}</strong>{d.feedbackDue && d.status === 'awaiting-feedback' && <span className="muted small"> · feedback {fmtDay(d.feedbackDue)}</span>}</td>
                        <td><span className={`pill pill-${d.status}`}>{DELIVERABLE_LABEL[d.status] === 'Awaiting your feedback' ? 'With the client' : DELIVERABLE_LABEL[d.status]}</span></td>
                        <td>v{d.version}{d.viewedVersion === d.version && d.status === 'awaiting-feedback' ? ' · opened' : ''}</td>
                        <td className="num">{d.shareUrl ? <a className="text-link" href={d.shareUrl} target="_blank" rel="noopener noreferrer">Frame.io<span className="sr-only"> (opens in a new tab)</span></a> : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small a-empty">No deliverables yet.</p>
            )}
          </section>

          <section className="p-card" aria-labelledby="h-rev">
            <div className="a-card-head">
              <h2 id="h-rev" className="a-h2">Revisions</h2>
              <span className="muted small">Two rounds, every project</span>
            </div>
            <div className="a-rounds">
              {[
                { n: 1, title: 'Major feedback on the rough cut', due: p.milestones.round1Due },
                { n: 2, title: 'Minor changes on the final cut', due: p.milestones.round2Due },
              ].map((r) => (
                <div key={r.n} className={`a-round ${round > r.n ? 'done' : round === r.n ? 'now' : ''}`}>
                  <span className="a-round-label">Round {r.n} of 2 · {round > r.n ? 'Done' : round === r.n ? 'Now' : 'Later'}</span>
                  <strong>{r.title}</strong>
                  <span className="muted small">{r.due ? `Feedback due ${fmtDay(r.due)}` : 'No due date set'}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="p-card" aria-labelledby="h-notes">
            <h2 id="h-notes" className="a-h2">Notes and activity</h2>
            <NoteForm projectId={p._id} />
            {feed.length > 0 && (
              <ul className="a-feed">
                {feed.map((f, i) => (
                  <li key={i}>
                    <span className="stack">
                      <span className={f.source === 'Your note' ? 'a-note' : undefined}>{f.text}</span>
                      <span className="muted small">{f.source}</span>
                    </span>
                    <span className="muted small">{ago(f.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="stack a-col a-aside" aria-label="Project details">
          <section className="p-card" aria-labelledby="h-dates">
            <div className="a-card-head">
              <h2 id="h-dates" className="a-h2">Key dates</h2>
              <a className="text-link small" href={studioHref(p._id)} target="_blank" rel="noopener noreferrer">Edit<span className="sr-only"> dates in the Studio</span></a>
            </div>
            {dates.length ? (
              <dl className="key-dates">
                {dates.map((d, i) => (
                  <div key={i}>
                    <dt className={d.past ? 'past' : undefined}>{d.label}</dt>
                    <dd>{d.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted small a-empty">No dates yet.</p>
            )}
            <p className="muted small" style={{ margin: 0 }}>Changing a date moves its calendar event and TickTick tasks within 10 minutes.</p>
            <SyncButton projectId={p._id} />
          </section>

          <section className="p-card" aria-labelledby="h-money">
            <div className="a-card-head">
              <h2 id="h-money" className="a-h2">Money</h2>
              <span className="muted small">From Xero</span>
            </div>
            <dl className="key-dates">
              {p.projectType === 'retainer' ? (
                <div><dt>Monthly fee</dt><dd>{p.retainer?.monthlyFee ? cad(p.retainer.monthlyFee) : '—'}</dd></div>
              ) : (
                <div><dt>Quote</dt><dd>{p.quoteAmount ? cad(p.quoteAmount) : '—'}</dd></div>
              )}
              {p.projectType !== 'retainer' && (
                <div>
                  <dt>Deposit</dt>
                  <dd>{p.depositAmount ? cad(p.depositAmount) : '—'}{deposit && ` · ${INVOICE_WORD[deposit.status ?? 'draft'] ?? deposit.status}`}</dd>
                </div>
              )}
              <div>
                <dt>{p.projectType === 'retainer' ? 'This month’s invoice' : 'Final invoice'}</dt>
                <dd className={!final && si >= stageIndex('delivered') ? 'a-accent' : undefined}>{final ? `${cad(final.amount)} · ${INVOICE_WORD[final.status ?? 'draft'] ?? final.status}` : 'Not created'}</dd>
              </div>
            </dl>
            {invoices.length > 0 && (
              <ul className="a-links">
                {invoices.map((i) => (
                  <li key={i._key}>
                    <a href={invoiceUrl(i.id)} target="_blank" rel="noopener noreferrer">
                      <span className="stack"><strong>Invoice {i.number ?? i.id}</strong><span className="muted small">{i.kind === 'deposit' ? 'Deposit' : i.kind === 'retainer' ? 'Retainer' : 'Balance'} · {cad(i.amount)}</span></span>
                      <span aria-hidden="true">↗</span>
                      <span className="sr-only">(opens Xero)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {!final && <p className="muted small" style={{ margin: 0 }}>The final invoice is drafted when you move the project to Delivered.</p>}
          </section>

          <section className="p-card" aria-labelledby="h-links">
            <h2 id="h-links" className="a-h2">Links</h2>
            <ul className="a-links">
              {[
                p.frameioProjectUrl && { name: 'Frame.io project', detail: `${p.deliverables.length} deliverable${p.deliverables.length === 1 ? '' : 's'}`, href: p.frameioProjectUrl },
                p.driveFolderId && { name: 'Drive folder', detail: `${p.client.organizationName} / ${p.title}`, href: `https://drive.google.com/drive/folders/${p.driveFolderId}` },
                p.office.ticktickProjectId && { name: 'TickTick list', detail: `${(p.office.tasks ?? []).length} tasks added`, href: `https://ticktick.com/webapp/#p/${p.office.ticktickProjectId}/tasks` },
                p.quoteUrl && { name: 'Quote', detail: 'The quote file', href: p.quoteUrl },
                p.slug && si >= stageIndex('booked') && { name: 'Client portal page', detail: 'What the client sees', href: `/portal/${p.slug}` },
              ]
                .filter((x): x is { name: string; detail: string; href: string } => Boolean(x))
                .map((l) => (
                  <li key={l.name}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer">
                      <span className="stack"><strong>{l.name}</strong><span className="muted small">{l.detail}</span></span>
                      <span aria-hidden="true">↗</span>
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
            </ul>
          </section>

          <section className="p-card" aria-labelledby="h-people">
            <h2 id="h-people" className="a-h2">People</h2>
            <dl className="key-dates">
              {(p.client.contacts ?? []).map((c) => (
                <div key={c._key}>
                  <dt><a className="text-link-plain" href={`mailto:${c.email}`}>{c.name}</a></dt>
                  <dd className="muted">{c.role || p.client.organizationName}</dd>
                </div>
              ))}
              {(p.crew ?? []).map((c) => (
                <div key={c._key}>
                  <dt>{c.name}</dt>
                  <dd className="muted">{c.role}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  )
}
