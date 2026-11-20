import { notFound } from 'next/navigation'
import { requireAdmin } from '@/admin/auth'
import { listClients, listProjects } from '@/admin/data'
import { viewUrl } from '@/galleries/files'
import { galleriesSampleMode, getGallery, listFavourites, listVisits } from '@/galleries/store'
import { formatBytes } from '@/galleries/types'
import { DangerZone } from '@/galleries/ui/admin-copy'
import { PhotoGrid, type AdminPhoto } from '@/galleries/ui/admin-grid'
import { GalleryHeader } from '@/galleries/ui/admin-header'
import { Activity, Favourites } from '@/galleries/ui/admin-insights'
import { SetsPanel } from '@/galleries/ui/admin-sets'
import { DownloadsPanel, ExpiryPanel, MessagePanel } from '@/galleries/ui/admin-settings'
import { SharePanel, type Recipient } from '@/galleries/ui/admin-share'
import { Uploader } from '@/galleries/ui/admin-uploader'
import { SITE_URL } from '@/lib/site'
import '@/galleries/galleries-admin.css'

export const metadata = { title: 'Gallery' }

/** One gallery from the back office: upload, organise, share, and see what the client picked. */
export default async function GalleryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = await requireAdmin()
  const g = await getGallery(id)
  if (!g) notFound()
  const [favs, visits, clients, projects] = await Promise.all([listFavourites(g._id), listVisits(g._id), listClients().catch(() => []), listProjects().catch(() => [])])
  const ro = Boolean(admin.viewOnly)

  const firstSet = g.sets[0]?._key ?? ''
  const favCount = new Map<string, number>()
  for (const f of favs) for (const k of f.keys) favCount.set(k, (favCount.get(k) ?? 0) + 1)
  const photos: AdminPhoto[] = g.photos.map((p) => ({ key: p._key, set: p.set && g.sets.some((s) => s._key === p.set) ? p.set : firstSet, name: p.name, thumb: viewUrl(g, p, 'thumb'), w: p.w, h: p.h, favs: favCount.get(p._key) ?? 0 }))
  const counts: Record<string, number> = {}
  for (const p of photos) counts[p.set] = (counts[p.set] ?? 0) + 1
  const bytes = g.photos.reduce((n, p) => n + p.size, 0)

  const client = clients.find((c) => c._id === g.clientId)
  const recipients: Recipient[] = (client?.contacts ?? []).filter((c) => c.email).map((c) => ({ name: c.name, email: c.email }))
  if (!recipients.length && client?.billingEmail) recipients.push({ email: client.billingEmail })
  const clientOptions = clients.map((c) => ({ id: c._id, name: c.organizationName })).sort((a, b) => a.name.localeCompare(b.name))
  const projectOptions = projects.filter((p) => (!p.archived || p._id === g.projectId) && p.client._id).map((p) => ({ id: p._id, title: p.title, clientId: p.client._id }))
  const shareUrl = `${SITE_URL}/g/${g.slug}`
  const canLink = g.status === 'live' && g.share.on

  return (
    <div className="a-page ga-page">
      {galleriesSampleMode() && <p className="a-sample" role="status" style={{ margin: 0 }}>Sample mode: nothing is saved. Galleries and uploads live in memory until the dev server restarts.</p>}

      <GalleryHeader
        id={g._id}
        title={g.title}
        date={g.date}
        clientId={g.clientId}
        projectId={g.projectId}
        clientName={g.clientName ?? client?.organizationName}
        projectTitle={g.projectTitle}
        status={g.status}
        shareOn={g.share.on}
        shareUrl={shareUrl}
        count={g.photos.length}
        size={formatBytes(bytes)}
        clients={clientOptions}
        projects={projectOptions}
        ro={ro}
      />

      <div className="ga-layout">
        <div className="ga-main">
          <Uploader id={g._id} sets={g.sets} sample={Boolean(g.sample)} ro={ro} />
          <PhotoGrid id={g._id} sets={g.sets} photos={photos} coverKey={g.coverKey} ro={ro} />
        </div>
        <aside className="ga-aside" aria-label="Gallery settings">
          <SharePanel id={g._id} title={g.title} status={g.status} shareOn={g.share.on} shareUrl={shareUrl} hasPassword={Boolean(g.share.passwordHash)} expiresOn={g.expiresOn} recipients={recipients} ro={ro} />
          <ExpiryPanel id={g._id} title={g.title} expiresOn={g.expiresOn} shareUrl={shareUrl} canLink={canLink} recipients={recipients} ro={ro} />
          <DownloadsPanel id={g._id} downloads={g.downloads} ro={ro} />
          <MessagePanel id={g._id} message={g.message} ro={ro} />
          <SetsPanel id={g._id} sets={g.sets} counts={counts} ro={ro} />
        </aside>
      </div>

      <div className="ga-insights">
        <Favourites favs={favs} photos={photos} />
        <Activity visits={visits} photos={photos} sets={g.sets} />
      </div>

      {!ro && <DangerZone id={g._id} title={g.title} />}
    </div>
  )
}
