/* eslint-disable @next/next/no-img-element -- thumbnails are short-lived signed addresses */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { viewUrl } from '@/galleries/files'
import { galleriesForClients } from '@/galleries/store'
import { isExpired } from '@/galleries/types'
import { requireAccess } from '@/portal/current'
import { byStart, CLIENT_STAGES, clientStage, projectThumb, today, versionPath } from '@/portal/library'
import { notificationsFor } from '@/portal/notifications'
import { ClientLibrary } from '@/portal/portal-library'
import { QuoteList } from '@/portal/quote-list'
import type { ClientProject } from '@/portal/types'
import { EmptyMark } from '@/portal/ui'
import { RetainerCards, retainerCardsFor } from '@/portal/retainer-home'
import { StageMap } from '@/portal/stage-map'

export const metadata = { title: 'Your projects' }

type Props = { searchParams: Promise<{ open?: string }> }

const isDone = (p: ClientProject) => p.status === 'delivered' || p.pipelineStage === 'delivered' || p.pipelineStage === 'paid'
const atPath = (parts: string[]) => parts.map(encodeURIComponent).join('/')
// Finished projects sit on Delivered even if their pipeline stage lags behind.
const stageOf = (p: ClientProject) => (isDone(p) ? CLIENT_STAGES.length : clientStage(p.pipelineStage, p.status))

/** Cover for the "Your libraries" tile: a photo from the newest open gallery. Never breaks the home page. */
async function libraryCover(clientIds: string[]) {
  try {
    const g = (await galleriesForClients(clientIds)).find((x) => !isExpired(x) && x.photos.length)
    if (!g) return ''
    const cover = g.photos.find((x) => x._key === g.coverKey) ?? g.photos[0]
    return viewUrl(g, cover, 'thumb')
  } catch {
    return ''
  }
}

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

  // Retainer clients (monthly content) get a card near the top; for some people it's the only thing here.
  const [retainers, cover] = await Promise.all([retainerCardsFor(session), libraryCover(clients.map((c) => c._id))])

  if (!clients.length && !retainers.length) {
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
  // "Your work": active projects first, then delivered. Invoice details and guest share links stay on the server, as on the project page.
  const forBrowser = [...active, ...archive].map((p) => ({ ...p, billing: undefined, deliverables: p.deliverables?.map(({ share: _share, commentsPending: _p, ...d }) => d) }))
  const me = clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === session.email)
  // Quotes come first: before we book, they're the whole relationship.
  const { toSign, due, waiting } = await notificationsFor()
  // One timeline across every project, once there's more than one to place on it.
  const stageMap = projects.length > 1
    ? CLIENT_STAGES.map((st, i) => ({ title: st.title, projects: sorted.filter((p) => stageOf(p) === i + 1).map((p) => ({ title: p.title, slug: p.slug })) }))
    : null
  return (
    <div className="wrap p-home">
      <section className="p-hello">
        <span className="eyebrow">{(clients.length ? clients : retainers).map((c) => c.organizationName).join(' · ')}</span>
        <h1 className="h1">Hi {name ?? 'there'}, welcome to your client portal.</h1>
        <p className="body-lg muted" style={{ margin: 0 }}>
          {toSign.length
            ? `${toSign.length === 1 ? `Your quote for ${toSign[0].title} is` : `${toSign.length} quotes are`} ready to review and sign.`
            : waiting ? `${waiting === 1 ? 'One thing is' : `${waiting} things are`} waiting for your feedback.`
              : due.length ? `${due.length === 1 ? 'One payment is' : `${due.length} payments are`} ready when you are.` : 'You’re all caught up.'}
        </p>
      </section>

      {stageMap && (
        <section className="p-where" aria-labelledby="where-h">
          <h2 id="where-h" className="p-label">Where we are</h2>
          <StageMap stages={stageMap} />
        </section>
      )}

      {retainers.length > 0 && <RetainerCards cards={retainers} />}

      {toSign.length > 0 && <QuoteList id="quotes-h" label="Ready for your signature" quotes={toSign} t={today()} />}

      {(clients.length > 0 || active.length > 0) && (
      <section aria-labelledby="projects-h" className="p-home-sec">
        <h2 id="projects-h" className="p-label">{active.length ? 'Projects' : !toSign.length && !retainers.length ? 'No projects on the go right now' : 'Libraries'}</h2>
        <ul className="proj-grid">
          {active.map((p) => <ProjectCard key={p._id} p={p} org={multi ? p.client.organizationName : undefined} />)}
          {clients.length > 0 && <LibraryCard cover={cover} />}
        </ul>
      </section>
      )}

      {sorted.length > 1 && (
        <section id="work" aria-labelledby="work-h" className="p-work p-anchor">
          <h2 id="work-h" className="h3">Your work</h2>
          <Suspense>
            <ClientLibrary projects={forBrowser} demo={Boolean(session.demo)} uploaderName={me?.name ?? ''} viewOnly={Boolean(session.preview)} />
          </Suspense>
        </section>
      )}

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

function LibraryCard({ cover }: { cover: string }) {
  return (
    <li>
      <Link className="proj-card-p proj-card-lib" href="/portal/galleries">
        <span className="proj-thumb" aria-hidden="true">
          {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <EmptyMark />}
        </span>
        <span className="proj-body">
          <span className="fd-kicker">Photos</span>
          <strong className="proj-title">Your libraries</strong>
          <span className="muted small">Every photo gallery we’ve shared with you</span>
        </span>
      </Link>
    </li>
  )
}
