import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSettings } from '@/lib/data'
import { requireAccess } from '@/portal/current'
import { getPortalSettings, producerFor } from '@/portal/data'
import { ProjectFiles } from '@/portal/files-panel'
import { fileKind, IconFor } from '@/portal/file-icon'
import { downloadSource, linkKind } from '@/portal/links'
import { FeedbackButtons, ReviewThumb } from '@/portal/review-ui'
import { isReviewLink } from '@/portal/vimeo'
import { daysUntil, EmptyMark, fmtDate, ProducerCard, StageBar, StatusPill, timeAgo } from '@/portal/ui'

type Props = { params: Promise<{ slug: string }> }

const FALLBACK_STAGES = ['Listen', 'Earn trust', 'Find what matters', 'Craft the film']

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const { projects } = await requireAccess()
  return { title: projects.find((p) => p.slug === slug)?.title ?? 'Project' }
}

export default async function PortalProject({ params }: Props) {
  const { slug } = await params
  const { projects, session, clients } = await requireAccess()
  const p = projects.find((x) => x.slug === slug)
  if (!p) notFound()
  const [ps, site] = await Promise.all([getPortalSettings(), getSettings()])
  const stages = site.processSteps?.length >= 4 ? site.processSteps.map((s) => s.title) : FALLBACK_STAGES
  // Versions still in progress stay hidden until they're ready to watch.
  const deliverables = (p.deliverables ?? []).filter((d) => d.status !== 'in-progress')
  const links = (p.links ?? []).filter((l) => l.title && l.url)
  const keyDates = (p.keyDates ?? []).filter((k) => k.label).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const me = clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === session.email)

  return (
    <div className="wrap p-project">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/portal">← All projects</Link>
      </nav>

      <header className="p-project-head">
        <div className="stack" style={{ gap: 'var(--space-3)', minWidth: 0 }}>
          <div className="row-wrap">
            <StatusPill status={p.status} />
            <span className="eyebrow">{p.client.organizationName}</span>
          </div>
          <h1 className="h1">{p.title}</h1>
          {p.summary && <p className="body-lg muted" style={{ margin: 0, maxWidth: '62ch' }}>{p.summary}</p>}
        </div>
      </header>

      <section className="p-where" aria-labelledby="where-h">
        <h2 id="where-h" className="p-label">Where we are</h2>
        <StageBar stage={p.stage} names={stages} dates={p.stageDates} />
        {p.nextStep && (
          <p className="p-next">
            <span className="p-label">Next</span>
            <span>{p.nextStep}</span>
          </p>
        )}
      </section>

      <div className="p-proj-grid">
        <div className="stack" style={{ gap: 'var(--space-12)', minWidth: 0 }}>
          <section aria-labelledby="review-h">
            <div className="p-sec-head"><h2 id="review-h" className="h3">For your review</h2></div>
            {deliverables.length ? (
              <ul className="deliv-list">
                {deliverables.map((d) => {
                  const days = daysUntil(d.feedbackDue)
                  const meta = [
                    d.length && `${d.length} long`,
                    d.feedbackDue && d.status === 'awaiting-feedback' && `Feedback by ${fmtDate(d.feedbackDue, { weekday: 'short', month: 'short', day: 'numeric' })}`,
                  ].filter(Boolean)
                  return (
                    <li key={d._key} className={`deliv deliv-${d.status}`}>
                      {!d.vimeoEmbed && d.fileUrl ? (
                        <div className="thumb media review-thumb">
                          <ReviewThumb src={`/api/portal/review/${d._key}?project=${encodeURIComponent(p.slug)}&mode=preview`} kind={fileKind({ name: d.fileName })} ext={d.fileName?.split('.').pop()} />
                        </div>
                      ) : d.vimeoEmbed ? (
                        <div className="thumb media ratio-169 deliv-player">
                          <iframe src={d.vimeoEmbed} title={`${d.title} v${d.version}`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy" />
                        </div>
                      ) : (
                      <div className="thumb media ratio-169" aria-hidden="true">
                        {d.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.thumbUrl} alt="" />
                        ) : (
                          <span className="play-dot" />
                        )}
                      </div>
                      )}
                      <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
                        <div className="row-wrap">
                          <strong className="review-title">{d.title} <span className="ver">v{d.version}</span></strong>
                          <StatusPill status={d.status} kind="deliverable" />
                        </div>
                        {meta.length > 0 && (
                          <span className={`small ${days !== null && days <= 2 && d.status === 'awaiting-feedback' ? 'due-soon' : 'muted'}`}>{meta.join(' · ')}</span>
                        )}
                        {d.notes && d.status !== 'approved' && <p className="deliv-note">{d.notes}</p>}
                        {d.fileUrl && (
                          <div className="btn-row" style={{ marginTop: 4 }}>
                            <a className="btn btn-sm btn-secondary" href={`/api/portal/review/${d._key}?project=${encodeURIComponent(p.slug)}&mode=view`} target="_blank" rel="noopener noreferrer">
                              View <span aria-hidden="true">↗</span><span className="sr-only">(opens in a new tab)</span>
                            </a>
                            <a className="btn btn-sm btn-secondary" href={`/api/portal/review/${d._key}?project=${encodeURIComponent(p.slug)}&mode=download`} download>
                              Download <span aria-hidden="true">↓</span>
                            </a>
                          </div>
                        )}
                        {d.shareUrl && (
                          <div className="btn-row" style={{ marginTop: 4 }}>
                            <a
                              className={`btn btn-sm ${d.status === 'awaiting-feedback' ? 'btn-primary' : 'btn-secondary'}`}
                              href={d.shareUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {d.status === 'awaiting-feedback' && isReviewLink(d.shareUrl) ? 'Leave time-coded notes' : 'Open on Vimeo'} <span aria-hidden="true">↗</span>
                              <span className="sr-only">(opens Vimeo in a new tab)</span>
                            </a>
                          </div>
                        )}
                        {d.status === 'awaiting-feedback' && <FeedbackButtons project={p.slug} deliverable={d._key} title={`${d.title} v${d.version}`} />}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="p-empty">
                <EmptyMark />
                <p className="muted" style={{ margin: 0 }}>Nothing to watch yet. We’ll email you the moment a first cut is ready.</p>
              </div>
            )}

            <details className="howto">
              <summary>How to leave feedback</summary>
              <ol className="steps-list">
                {ps.feedbackSteps.map((s, i) => <li key={i}><span>{s}</span></li>)}
              </ol>
              {ps.feedbackVideo && (
                <a className="link-arrow" href={ps.feedbackVideo} target="_blank" rel="noopener noreferrer">Watch a 1-minute how-to <span aria-hidden="true">↗</span></a>
              )}
            </details>
          </section>

          {links.length > 0 && (
            <section aria-labelledby="links-h">
              <div className="p-sec-head"><h2 id="links-h" className="h3">Documents &amp; links</h2></div>
              <ul className="p-links">
                {links.map((l) => (
                  <li key={l._key}>
                    {downloadSource(l.url!) ? (
                      <a href={`/api/portal/link/${l._key}?project=${encodeURIComponent(p.slug)}`} download>
                        <IconFor url={l.url} name={l.title} />
                        <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                          <strong>{l.title}</strong>
                          <span className="muted small">{[linkKind(l.url!), l.note].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="p-link-action">Download <span aria-hidden="true">↓</span></span>
                      </a>
                    ) : (
                      <a href={l.url} target="_blank" rel="noopener noreferrer">
                        <IconFor url={l.url} />
                        <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                          <strong>{l.title}</strong>
                          <span className="muted small">{[linkKind(l.url!), l.note].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="p-link-action">Open <span aria-hidden="true">↗</span></span>
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ProjectFiles
            project={p.slug}
            intro={ps.filesIntro}
            demo={Boolean(session.demo)}
            uploaderName={me?.name ?? ''}
          />
        </div>

        <aside className="stack" style={{ gap: 'var(--space-6)', minWidth: 0 }}>
          <ProducerCard producer={producerFor(p, ps)} />
          {keyDates.length > 0 && (
            <section className="p-card" aria-labelledby="dates-h">
              <h2 id="dates-h" className="p-label">Key dates</h2>
              <dl className="key-dates">
                {keyDates.map((k) => {
                  const past = k.date ? (daysUntil(k.date) ?? 0) < 0 : false
                  return (
                    <div key={k._key} className={past ? 'past' : undefined}>
                      <dt>{k.label}</dt>
                      <dd>{k.date ? fmtDate(k.date, { weekday: 'short', month: 'short', day: 'numeric' }) : 'To be set'}</dd>
                    </div>
                  )
                })}
              </dl>
            </section>
          )}
          <section className="p-card" aria-labelledby="act-h">
            <h2 id="act-h" className="p-label">Latest activity</h2>
            {p.activity?.length ? (
              <ul className="activity">
                {p.activity.slice(0, 8).map((a) => (
                  <li key={a._key} className={`act-${a.kind ?? 'note'}`}>
                    <span>{a.text}</span>
                    <time className="muted small" dateTime={a.at}>{timeAgo(a.at)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>New versions, comments and uploads will show up here.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
