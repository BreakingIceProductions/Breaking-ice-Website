import Link from 'next/link'
import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { galleryView, isDenied, resolveGallery, statsWho } from '@/galleries/access'
import { recordView } from '@/galleries/store'
import { GalleryViewer } from '@/galleries/ui/gallery-viewer'
import '@/galleries/gallery.css'

export const metadata = { title: 'Photos' }

type Props = { params: Promise<{ id: string }> }

/** One gallery inside the client portal: only the client's own, live and still open. */
export default async function PortalGallery({ params }: Props) {
  const { id } = await params
  const r = await resolveGallery('portal', decodeURIComponent(id))
  if (isDenied(r) && r.denied !== 'closed') notFound()

  if (isDenied(r)) {
    return (
      <div className="wrap p-empty-page">
        <h1 className="h2">This gallery has closed</h1>
        <p className="muted">{r.gallery?.title ? `${r.gallery.title} was open for a limited time.` : 'It was open for a limited time.'} If you still need these photos, reply to any of our emails and Josh will sort it out.</p>
        <Link className="btn btn-secondary" href="/portal/galleries">All galleries</Link>
      </div>
    )
  }

  if (!r.readOnly) {
    const who = statsWho(r)
    if (who) after(() => recordView(r.gallery._id, who).catch((e) => console.error('[galleries] view not recorded', e)))
  }

  return (
    <>
      <div className="wrap" style={{ paddingTop: 'var(--space-4)' }}>
        <Link className="small muted" href="/portal/galleries">← All galleries</Link>
      </div>
      <GalleryViewer view={await galleryView(r)} />
    </>
  )
}
