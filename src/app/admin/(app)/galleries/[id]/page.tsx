import '../../../../css/admin-pages.css'
import '../../../../css/admin-simple-b.css'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/admin/auth'
import { adminSampleMode } from '@/admin/config'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import { listClients, listProjects } from '@/admin/data'
import { folderUrl } from '@/galleries/drive'
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
import { Drawer } from '@/admin/ui/viz'
import { SITE_URL } from '@/lib/site'
import '@/galleries/galleries-admin.css'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  return { title: (await getGallery(id))?.title ?? 'Gallery' }
}

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

  // Every setup panel lives in one drawer behind the Settings button, so the page opens on the photos.
  const settings = (
    <Drawer
      title="Settings"
      button={
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
          Settings
        </>
      }
    >
      <SharePanel id={g._id} title={g.title} status={g.status} shareOn={g.share.on} shareUrl={shareUrl} hasPassword={Boolean(g.share.passwordHash)} expiresOn={g.expiresOn} recipients={recipients} ro={ro} />
      <ExpiryPanel id={g._id} title={g.title} expiresOn={g.expiresOn} shareUrl={shareUrl} canLink={canLink} recipients={recipients} ro={ro} />
      <DownloadsPanel id={g._id} downloads={g.downloads} ro={ro} />
      <MessagePanel id={g._id} message={g.message} ro={ro} />
      <SetsPanel id={g._id} sets={g.sets} counts={counts} ro={ro} />
      {!g.sample && <StoragePanel originals={g.originals === 'drive' ? 'drive' : 'r2'} folder={g.drive?.folderId} client={g.clientName} />}
      {!ro && <DangerZone id={g._id} title={g.title} />}
    </Drawer>
  )

  return (
    <div className="a-page ga-page ga-page-one">
      <Breadcrumb trail={[{ label: 'Galleries', href: '/admin/galleries' }]} />
      {galleriesSampleMode() && !adminSampleMode() && <p className="a-sample m0" role="status">Galleries aren’t connected on this site yet, so nothing here is saved.</p>}

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
        settings={settings}
      />

      <div className="ga-main">
        <Uploader id={g._id} sets={g.sets} sample={Boolean(g.sample)} ro={ro} startOpen={!g.photos.length} />
        <PhotoGrid id={g._id} sets={g.sets} photos={photos} coverKey={g.coverKey} ro={ro} />
      </div>

      <div className="ga-insights">
        <Favourites favs={favs} photos={photos} />
        <Activity visits={visits} photos={photos} sets={g.sets} />
      </div>
    </div>
  )
}

/** Where this gallery's files live, so Josh can find the originals. */
function StoragePanel({ originals, folder, client }: { originals: 'drive' | 'r2'; folder?: string; client?: string }) {
  const url = folder ? folderUrl(folder) : ''
  return (
    <section className="p-card ga-panel" aria-labelledby="ga-store-h">
      <div className="a-card-head">
        <h2 id="ga-store-h" className="a-h2">Where the files are</h2>
      </div>
      {originals === 'drive' ? (
        <>
          <p className="small m0" title="One folder per set. Previews for browsing are kept in Cloudflare.">
            Originals: Google Drive · BI Clients / {client ?? 'Galleries without a client'}
            {client ? ' / Photos' : ''} / this gallery
          </p>
          {url ? (
            <a className="text-link small" href={url} target="_blank" rel="noopener noreferrer">Open the Drive folder<span className="sr-only"> (opens in a new tab)</span></a>
          ) : (
            <p className="muted small m0">{folder ? 'Local test folder (no Google Drive on this machine).' : 'Made with the first upload.'}</p>
          )}
          <p className="muted small m0">Removing photos here never deletes anything from Drive.</p>
        </>
      ) : (
        <p className="small m0">Originals and previews: Cloudflare R2 (an older gallery, made before originals moved to Drive).</p>
      )}
    </section>
  )
}
