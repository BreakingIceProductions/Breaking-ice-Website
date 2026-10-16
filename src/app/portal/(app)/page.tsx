import Link from 'next/link'
import { getSettings } from '@/lib/data'
import { driveReady } from '@/portal/config'
import { requireAccess } from '@/portal/current'
import { getPortalSettings, producerFor } from '@/portal/data'
import { listProjectFiles } from '@/portal/drive'
import { fill } from '@/portal/email'
import { sampleFiles } from '@/portal/samples'
import type { ClientProject, DriveFile } from '@/portal/types'
import { daysUntil, EmptyMark, fmtDate, ProducerCard, StageBar, StatusPill, timeAgo } from '@/portal/ui'

export const metadata = { title: 'Your projects' }

const FALLBACK_STAGES = ['Listen', 'Earn trust', 'Find what matters', 'Craft the film']

export default async function Dashboard() {
  const { session, clients, projects, name } = await requireAccess()
  const [ps, site] = await Promise.all([getPortalSettings(), getSettings()])
  const stages = site.processSteps?.length >= 4 ? site.processSteps.map((s) => s.title) : FALLBACK_STAGES

  const review = projects
    .flatMap((p) => (p.deliverables ?? []).filter((d) => d.status === 'awaiting-feedback').map((d) => ({ p, d })))
    .sort((a, b) => (a.d.feedbackDue ?? '9999').localeCompare(b.d.feedbackDue ?? '9999'))
  const active = projects.filter((p) => p.status !== 'delivered')
  const past = projects.filter((p) => p.status === 'delivered')

  let recent: (DriveFile & { project: ClientProject })[] = []
  if (session.demo) recent = sampleFiles().map((f) => ({ ...f, project: projects[0] }))
  // Only projects whose folders already exist: the dashboard never creates folders.
  else if (driveReady())
    recent = (
      await Promise.all(active.filter((p) => p.driveFolderId).slice(0, 4).map((p) => listProjectFiles(p).then((fs) => fs.map((f) => ({ ...f, project: p }))).catch(() => [])))
    )
      .flat()
      .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
  recent = recent.slice(0, 5)

  const org = clients.map((c) => c.organizationName).join(' · ')
  const producer = projects[0] ? producerFor(projects[0], ps) : clients[0]?.producer?.name ? clients[0].producer : ps.producer
  const me = clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === session.email)
  const contactHref = `/contact?${new URLSearchParams({ name: me?.name ?? '', email: session.demo ? '' : session.email, organization: clients[0]?.organizationName ?? '' })}`

  if (!clients.length) {
    return (
      <div className="wrap p-empty-page">
        <EmptyMark />
        <h1 className="h2">There’s nothing here for this email</h1>
        <p className="muted">You’re signed in as {session.email}, but it isn’t on a project with us any more. If that seems wrong, reply to any of our emails and we’ll sort it out.</p>
        <form action="/api/portal/sign-out" method="post"><button className="btn btn-secondary" type="submit">Sign in with a different email</button></form>
      </div>
    )
  }

  return (
    <div className="wrap p-dash">
      <section className="p-hello">
        <span className="eyebrow">{org}</span>
        <h1 className="h1">{fill(ps.dashboardGreeting, { name: name ?? 'there' })}</h1>
        <p className="body-lg muted" style={{ margin: 0 }}>
          {review.length
            ? `${review.length} ${review.length === 1 ? 'thing needs' : 'things need'} your eyes.`
            : ps.nothingToReview}
        </p>
      </section>

      <div className="p-dash-grid">
        <div className="stack" style={{ gap: 'var(--space-12)', minWidth: 0 }}>
          <section aria-labelledby="review-h">
            <div className="p-sec-head">
              <h2 id="review-h" className="h3">Needs your review</h2>
              {review.length > 0 && <span className="count-badge">{review.length}</span>}
            </div>
            {review.length ? (
              <ul className="review-list">
                {review.map(({ p, d }) => {
                  const days = daysUntil(d.feedbackDue)
                  return (
                    <li key={p._id + d._key} className="review-row">
                      <div className="thumb media ratio-169" aria-hidden="true">
                        {d.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.thumbUrl} alt="" />
                        ) : (
                          <span className="play-dot" />
                        )}
                      </div>
                      <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                        <strong className="review-title">
                          {d.title} <span className="ver">v{d.version}</span>
                        </strong>
                        <span className="muted small">
                          <Link href={`/portal/${p.slug}`} className="text-link-plain">{p.title}</Link>
                          {d.feedbackDue && (
                            <>
                              {' · '}
                              <span className={days !== null && days <= 2 ? 'due-soon' : undefined}>Feedback by {fmtDate(d.feedbackDue, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="review-actions">
                        {d.shareUrl && (
                          <a className="btn btn-primary btn-sm" href={d.shareUrl} target="_blank" rel="noopener noreferrer">
                            Review in Frame.io <span aria-hidden="true">↗</span>
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="p-empty">
                <EmptyMark />
                <p className="muted" style={{ margin: 0 }}>{ps.nothingToReview}</p>
              </div>
            )}
          </section>

          <section aria-labelledby="projects-h">
            <div className="p-sec-head"><h2 id="projects-h" className="h3">Your projects</h2></div>
            {active.length ? (
              <div className="proj-grid">{active.map((p) => <ProjectCard key={p._id} p={p} stages={stages} />)}</div>
            ) : (
              <p className="muted">No active projects right now.</p>
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="past-h">
              <div className="p-sec-head"><h2 id="past-h" className="h3">Past projects</h2></div>
              <ul className="past-list">
                {past.map((p) => (
                  <li key={p._id}>
                    <Link href={`/portal/${p.slug}`}>
                      <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                        <strong>{p.title}</strong>
                        <span className="muted small">{clients.length > 1 ? `${p.client.organizationName} · ` : ''}Finals and files are still here</span>
                      </span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="stack" style={{ gap: 'var(--space-6)', minWidth: 0 }}>
          <ProducerCard producer={producer} title="Your contact" />
          <section className="p-card" aria-labelledby="files-h">
            <h2 id="files-h" className="p-label">Recent files</h2>
            {recent.length ? (
              <ul className="mini-files">
                {recent.map((f) => (
                  <li key={f.id}>
                    <span className="ext" aria-hidden="true">{(f.name.split('.').pop() ?? '').slice(0, 4)}</span>
                    <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                      <span className="fname">{f.name}</span>
                      <span className="muted small">{f.from === 'From client' ? 'From you' : f.from} · {timeAgo(f.modifiedTime)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>Files you send us, and files we share, show up here.</p>
            )}
            {active[0] && <Link className="link-arrow" href={`/portal/${active[0].slug}#files`}>Upload files <span aria-hidden="true">→</span></Link>}
          </section>
          <section className="p-card p-card-dark dark cut-lg" aria-labelledby="new-h">
            <h2 id="new-h" className="p-label">Something new?</h2>
            <p style={{ margin: 0 }}>{ps.newProjectLine}</p>
            <Link className="btn btn-primary btn-sm" href={contactHref}>Start a conversation</Link>
          </section>
        </aside>
      </div>
    </div>
  )
}

function ProjectCard({ p, stages }: { p: ClientProject; stages: string[] }) {
  return (
    <Link href={`/portal/${p.slug}`} className="proj-card">
      <div className="media ratio-169">
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.coverUrl} alt="" />
        ) : (
          <span className="media-placeholder"><EmptyMark /></span>
        )}
        <span className="proj-pill"><StatusPill status={p.status} /></span>
      </div>
      <div className="body">
        <strong className="card-title">{p.title}</strong>
        <StageBar stage={p.stage} names={stages} compact />
        <span className="muted small">Stage {p.stage} of 4 · {stages[p.stage - 1]}</span>
        {p.nextStep && <span className="small"><strong>Next:</strong> {p.nextStep}</span>}
      </div>
    </Link>
  )
}
