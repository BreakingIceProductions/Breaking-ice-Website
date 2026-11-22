import '../../../css/admin-pages.css'
import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { adminSampleMode } from '@/admin/config'
import { listClients, listProjects } from '@/admin/data'
import { viewUrl } from '@/galleries/files'
import { galleriesSampleMode, listGalleries } from '@/galleries/store'
import { daysLeft, formatBytes, isExpired } from '@/galleries/types'
import { fmtDay } from '@/galleries/ui/admin-api'
import { NewGalleryForm } from '@/galleries/ui/admin-new-gallery'
import '@/galleries/galleries-admin.css'

export const metadata = { title: 'Galleries' }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Every photo gallery, newest first, with the form for starting a new one. */
export default async function Galleries() {
  const admin = await requireAdmin()
  const [galleries, clients, projects] = await Promise.all([listGalleries(), listClients().catch(() => []), listProjects().catch(() => [])])
  const clientName = new Map(clients.map((c) => [c._id, c.organizationName]))
  const clientOptions = clients.map((c) => ({ id: c._id, name: c.organizationName })).sort((a, b) => a.name.localeCompare(b.name))
  const projectOptions = projects.filter((p) => !p.archived && p.client._id).map((p) => ({ id: p._id, title: p.title, clientId: p.client._id }))

  return (
    <div className="a-page ga-page">
      <header className="a-head">
        <div className="stack ap-head-text">
          <h1 className="a-h1">Galleries</h1>
          <p className="muted m0">Photo galleries for clients: upload a shoot, share a link, see their favourites.</p>
        </div>
      </header>

      {galleriesSampleMode() && !adminSampleMode() && <p className="a-sample m0" role="status">Galleries aren’t connected on this site yet, so nothing here is saved.</p>}

      {/* The form stays folded away until it's wanted (open from the start when there are no galleries yet). */}
      {!admin.viewOnly && (
        <details className="ga-new-toggle" open={!galleries.length}>
          <summary className="btn btn-primary">New gallery</summary>
          <NewGalleryForm clients={clientOptions} projects={projectOptions} />
        </details>
      )}

      <section aria-labelledby="ga-list-h" className="stack ap-gap-4">
        <h2 id="ga-list-h" className="a-h2">All galleries ({galleries.length})</h2>
        {galleries.length ? (
          <ul className="ga-list">
            {galleries.map((g) => {
              const cover = g.photos.find((p) => p._key === g.coverKey) ?? g.photos[0]
              const thumb = cover ? viewUrl(g, cover, 'thumb') : ''
              const left = daysLeft(g)
              const closed = isExpired(g)
              const soon = !closed && left !== null && left <= 7
              const client = g.clientName ?? (g.clientId ? clientName.get(g.clientId) : undefined)
              return (
                <li key={g._id} className="p-card ga-item">
                  <Link href={`/admin/galleries/${g._id}`} className="ga-item-cover" tabIndex={-1} aria-hidden="true">
                    {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" /> : <span className="ga-item-empty">No photos yet</span>}
                  </Link>
                  <div className="ga-item-body">
                    <span className="a-client">{client ?? 'No client'}</span>
                    <h3 className="ga-item-title">
                      <Link className="a-strong-link" href={`/admin/galleries/${g._id}`}>{g.title}</Link>
                    </h3>
                    <p className="muted small ga-item-meta">
                      {[g.date && fmtDay(g.date), plural(g.count, 'photo'), g.bytes ? formatBytes(g.bytes) : ''].filter(Boolean).join(' · ')}
                    </p>
                    <p className="ga-tags">
                      <span className={`ga-tag ${g.status === 'live' ? 'ga-tag-on' : ''}`}>{g.status === 'live' ? 'Live' : 'Draft'}</span>
                      <span className="ga-tag">Share link {g.share.on ? 'on' : 'off'}</span>
                      {closed ? (
                        <span className="ga-tag ga-tag-warn">Closed</span>
                      ) : left !== null ? (
                        <span className={`ga-tag ${soon ? 'ga-tag-warn' : ''}`}>{left === 0 ? 'Closes today' : `Closes in ${plural(left, 'day')}`}{soon ? ' · expiring soon' : ''}</span>
                      ) : null}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="p-card">
            <p className="a-empty"><strong>No galleries yet.</strong></p>
            <p className="muted small a-empty">Start one with New gallery, then drop a folder of photos onto it.</p>
          </div>
        )}
      </section>
    </div>
  )
}
