import { requireAdmin } from '@/admin/auth'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getClient } from '@/admin/data'
import { ago, cad } from '@/admin/insights'
import { stageIndex, stageTitle } from '@/admin/stages'
import type { OfficeProject } from '@/admin/types'
import { PROJECT_TYPES } from '@/sanity/portal/office-constants'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  return { title: (await getClient(id))?.organizationName ?? 'Client' }
}

const studioHref = (id: string) => `/studio/portal/structure/client;${encodeURIComponent(id)}`

/** Where each project sits in the relationship: on the go, still a conversation, or done. */
const GROUPS: { title: string; test: (p: OfficeProject) => boolean; empty: string }[] = [
  { title: 'On the go', test: (p) => stageIndex(p.pipelineStage) >= stageIndex('booked') && stageIndex(p.pipelineStage) < stageIndex('delivered'), empty: 'Nothing in production right now.' },
  { title: 'In conversation', test: (p) => stageIndex(p.pipelineStage) < stageIndex('booked'), empty: '' },
  { title: 'Done together', test: (p) => stageIndex(p.pipelineStage) >= stageIndex('delivered'), empty: 'No finished projects here yet.' },
]

export default async function ClientPage({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  const c = await getClient(id)
  if (!c) notFound()
  const delivered = c.projects.filter(GROUPS[2].test).length
  const feed = c.projects
    .flatMap((p) => [
      ...p.activity.map((a) => ({ at: a.at, text: a.text, project: p.title })),
      ...(p.office.log ?? []).map((l) => ({ at: l.at, text: l.text, project: p.title })),
      ...(p.office.notes ?? []).map((n) => ({ at: n.at, text: n.text, project: p.title })),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12)
  const outstanding = c.billed - c.paid

  return (
    <div className="a-page">
      <nav className="small" aria-label="Breadcrumb">
        <Link className="text-link-plain muted" href="/admin/clients">Clients</Link> <span aria-hidden="true" className="muted">/</span> <span aria-current="page">{c.organizationName}</span>
      </nav>

      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)', minWidth: 0 }}>
          <span className="eyebrow">Client</span>
          <h1 className="a-h1">{c.organizationName}</h1>
          <div className="row-wrap a-chips">
            <a className="a-chip a-chip-link" href={studioHref(c._id)} target="_blank" rel="noopener noreferrer">Edit in Studio<span className="sr-only"> (opens in a new tab)</span> ↗</a>
            {c.driveFolderId && (
              <a className="a-chip a-chip-link" href={`https://drive.google.com/drive/folders/${c.driveFolderId}`} target="_blank" rel="noopener noreferrer">Drive folder<span className="sr-only"> (opens in a new tab)</span> ↗</a>
            )}
          </div>
        </div>
        <a className="btn btn-primary" href={`/studio/portal/intent/create/template=clientProject;type=clientProject`} target="_blank" rel="noopener noreferrer">
          New project<span className="sr-only"> (opens the Studio)</span>
        </a>
      </header>

      <dl className="a-kpis">
        <div className="a-kpi"><dt className="a-kpi-label">Projects</dt><dd className="a-kpi-num" style={{ margin: 0 }}>{c.projects.length}</dd><dd className="a-kpi-note" style={{ margin: 0 }}>{delivered} delivered</dd></div>
        <div className="a-kpi"><dt className="a-kpi-label">Invoiced</dt><dd className="a-kpi-num" style={{ margin: 0 }}>{cad(c.billed)}</dd><dd className="a-kpi-note" style={{ margin: 0 }}>through Xero</dd></div>
        <div className="a-kpi"><dt className="a-kpi-label">Outstanding</dt><dd className="a-kpi-num" style={{ margin: 0 }}>{cad(outstanding)}</dd><dd className="a-kpi-note" style={{ margin: 0 }}>{outstanding > 0 ? 'still to be paid' : 'all paid up'}</dd></div>
        <div className="a-kpi"><dt className="a-kpi-label">Last activity</dt><dd className="a-kpi-num" style={{ margin: 0, fontSize: 24 }}>{c.lastActivity ? ago(c.lastActivity) : '—'}</dd></div>
      </dl>

      <div className="a-grid-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 'var(--space-6)', minWidth: 0 }}>
          {GROUPS.map((g) => {
            const list = c.projects.filter(g.test)
            if (!list.length && !g.empty) return null
            return (
              <section key={g.title} className="p-card" aria-label={g.title}>
                <div className="a-card-head">
                  <h2 className="a-h2">{g.title}</h2>
                  <span className="muted small">{list.length}</span>
                </div>
                {list.length ? (
                  <ul className="a-rows">
                    {list.map((p) => (
                      <li key={p._id}>
                        <Link className="a-row-main" href={`/admin/projects/${p._id}`}>
                          <strong>{p.title}</strong>
                          <span className="muted small">
                            {[PROJECT_TYPES.find((t) => t.value === p.projectType)?.title, p.deliverables.length && `${p.deliverables.length} deliverable${p.deliverables.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ') || 'Open the project'}
                          </span>
                        </Link>
                        <span className="a-row-side">
                          <span className="a-stage">{stageTitle(p.pipelineStage)}</span>
                          {p.quoteAmount ? <span className="muted small">{cad(p.quoteAmount)}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted a-empty">{g.empty}</p>
                )}
              </section>
            )
          })}
        </div>

        <aside className="stack" style={{ gap: 'var(--space-6)', minWidth: 0 }}>
          <section className="p-card" aria-labelledby="h-people">
            <h2 id="h-people" className="a-h2">People</h2>
            {c.contacts?.length ? (
              <dl className="key-dates">
                {c.contacts.map((p) => (
                  <div key={p._key}>
                    <dt><a className="text-link-plain" href={`mailto:${p.email}`}>{p.name}</a></dt>
                    <dd className="muted">{p.role || p.email}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted a-empty">No contacts yet. Add them in the Studio so they can sign in to the portal.</p>
            )}
            {c.billingEmail && <p className="muted small" style={{ margin: 0 }}>Invoices go to {c.billingEmail}</p>}
          </section>

          <section className="p-card" aria-labelledby="h-feed">
            <h2 id="h-feed" className="a-h2">Recent activity</h2>
            {feed.length ? (
              <ul className="a-feed">
                {feed.map((f, i) => (
                  <li key={i}>
                    <span className="stack" style={{ gap: 2 }}><span>{f.text}</span><span className="muted small">{f.project}</span></span>
                    <time className="muted small" dateTime={f.at}>{ago(f.at)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted a-empty">Versions, comments, stage changes and notes show up here.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
