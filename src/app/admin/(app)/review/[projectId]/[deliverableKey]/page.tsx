import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { ShareControl } from '@/admin/ui/share-control'
import { versionLabel, versionPath } from '@/portal/library'
import { ReviewRoom } from '@/portal/review-room'

type Props = { params: Promise<{ projectId: string; deliverableKey: string }> }

export async function generateMetadata({ params }: Props) {
  const { projectId, deliverableKey } = await params
  const p = await getProject(decodeURIComponent(projectId))
  const d = p?.deliverables.find((x) => x._key === decodeURIComponent(deliverableKey))
  return { title: d ? `${d.title} · ${versionLabel(d)}` : 'Review room' }
}

/** The owner's side of the review room: every comment, replies, mark done, and the guest link. */
export default async function AdminReview({ params }: Props) {
  const admin = await requireAdmin()
  const { projectId, deliverableKey } = await params
  const p = await getProject(decodeURIComponent(projectId))
  const d = p?.deliverables.find((x) => x._key === decodeURIComponent(deliverableKey))
  if (!p || !d) notFound()
  const finder = `/admin/clients?at=${[p.client._id, p.slug ?? p._id, ...versionPath(d)].map(encodeURIComponent).join('/')}`

  return (
    <div className="a-page">
      <Link className="text-link-plain muted small ld-back" href={`/admin/projects/${encodeURIComponent(p._id)}?tab=portal`}>← {p.title}</Link>
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
          <span className="eyebrow">Review room</span>
          <h1 className="a-h1">{d.title} <span className="muted">· {versionLabel(d)}</span></h1>
          <p className="muted" style={{ margin: 0 }}>{p.client.organizationName} · {p.title}</p>
        </div>
        <div className="pj-head-side">
          <Link className="btn btn-secondary btn-sm" href={finder}>Open in the Finder</Link>
        </div>
      </header>
      {admin.sample && <p className="a-sample" role="status" style={{ margin: 0 }}>Sample data: comments and links you make here aren’t saved.</p>}

      {d.host === 'r2' ? (
        <>
          <ReviewRoom
            via="admin"
            project={p._id}
            deliverableKey={d._key}
            title={d.title}
            versionLabel={versionLabel(d)}
            fps={d.fps ?? 23.976}
            duration={d.durationSec}
            status={d.status}
            readOnly={Boolean(admin.viewOnly)}
            note={d.notes}
          />
          <ShareControl projectId={p._id} deliverableKey={d._key} share={d.share} viewOnly={Boolean(admin.viewOnly)} />
        </>
      ) : (
        <section className="p-card">
          <p style={{ margin: 0 }}>This version plays on Vimeo, so its comments are on Vimeo’s review page.</p>
          {(d.vimeoReview ?? d.shareUrl) && <p style={{ margin: 0 }}><a className="text-link" href={(d.vimeoReview ?? d.shareUrl)!} target="_blank" rel="noopener noreferrer">Open it on Vimeo ↗</a></p>}
        </section>
      )}
    </div>
  )
}
