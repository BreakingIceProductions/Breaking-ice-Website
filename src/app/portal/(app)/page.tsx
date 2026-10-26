import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAccess } from '@/portal/current'
import { byStart, CLIENT_STAGES, clientCanOpen, clientStage, projectThumb, versionLabel, versionPath } from '@/portal/library'
import type { ClientProject } from '@/portal/types'
import { EmptyMark } from '@/portal/ui'

export const metadata = { title: 'Your projects' }

type Props = { searchParams: Promise<{ open?: string }> }

const isDone = (p: ClientProject) => p.status === 'delivered' || p.pipelineStage === 'delivered' || p.pipelineStage === 'paid'
const atPath = (parts: string[]) => parts.map(encodeURIComponent).join('/')

export default async function Home({ searchParams }: Props) {
  const { session, clients, projects, name } = await requireAccess()

  // Email links (?open=<version>) go straight to that version on its project page.
  const { open } = await searchParams
  if (open) {
    for (const p of projects) {
      const d = p.deliverables?.find((x) => x._key === open)
      if (d) redirect(`/portal/${p.slug}?at=${atPath(versionPath(d))}`)
    }
  }

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

  const sorted = [...projects].sort(byStart)
  const active = sorted.filter((p) => !isDone(p))
  const archive = sorted.filter(isDone)
  const multi = clients.length > 1
  const waiting = projects.flatMap((p) =>
    (p.deliverables ?? []).filter((d) => d.status === 'awaiting-feedback' && clientCanOpen(d, p.deliverables)).map((d) => ({ p, d })),
  )

  return (
    <div className="wrap p-home">
      <section className="p-hello">
        <span className="eyebrow">{clients.map((c) => c.organizationName).join(' · ')}</span>
        <h1 className="h1">Hi {name ?? 'there'}, welcome to your client portal.</h1>
        <p className="body-lg muted" style={{ margin: 0 }}>
          {waiting.length ? `${waiting.length === 1 ? 'One thing is' : `${waiting.length} things are`} waiting for your feedback.` : 'You’re all caught up.'}
        </p>
      </section>

      {waiting.length > 0 && (
        <section aria-labelledby="waiting-h" className="p-home-sec">
          <h2 id="waiting-h" className="p-label">Waiting for you</h2>
          <ul className="lib-list">
            {waiting.map(({ p, d }) => (
              <li key={d._key}>
                <Link className="lib-row" href={`/portal/${p.slug}?at=${atPath(versionPath(d))}`}>
                  <span className="fd-dot fd-dot-awaiting" aria-hidden="true" />
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <strong>{d.title} · {versionLabel(d)}</strong>
                    <span className="muted small">{p.title}</span>
                  </span>
                  <span className="lib-row-go" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="projects-h" className="p-home-sec">
        <h2 id="projects-h" className="p-label">{active.length ? 'Your projects' : 'No projects on the go right now'}</h2>
        {active.length > 0 && (
          <ul className="proj-grid">
            {active.map((p) => <ProjectCard key={p._id} p={p} org={multi ? p.client.organizationName : undefined} />)}
          </ul>
        )}
      </section>

      {archive.length > 0 && (
        <details className="p-archive">
          <summary>See project archive <span className="muted">({archive.length})</span></summary>
          <ul className="proj-grid proj-grid-small">
            {archive.map((p) => <ProjectCard key={p._id} p={p} org={multi ? p.client.organizationName : undefined} />)}
          </ul>
        </details>
      )}
    </div>
  )
}

function ProjectCard({ p, org }: { p: ClientProject; org?: string }) {
  const thumb = projectThumb(p)
  const stage = CLIENT_STAGES[clientStage(p.pipelineStage, p.status) - 1].title
  return (
    <li>
      <Link className="proj-card-p" href={`/portal/${p.slug}`}>
        <span className="proj-thumb" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumb ? <img src={thumb} alt="" /> : <EmptyMark />}
        </span>
        <span className="proj-body">
          {p.startDate && <span className="fd-kicker">{p.startDate}</span>}
          <strong className="proj-title">{p.title}</strong>
          <span className="muted small">{[org, stage].filter(Boolean).join(' · ')}</span>
          {p.nextStep && <span className="proj-next small">{p.nextStep}</span>}
        </span>
      </Link>
    </li>
  )
}
