import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/admin/auth'
import { galleryView, isDenied, resolveGallery } from '@/galleries/access'
import { GalleryViewer } from '@/galleries/ui/gallery-viewer'
import '@/galleries/gallery.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gallery preview' }

type Props = { params: Promise<{ id: string }> }

/** The gallery exactly as a client sees it (no hearts, nothing recorded), for checking before sending. */
export default async function GalleryPreview({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  const r = await resolveGallery('admin', decodeURIComponent(id))
  if (isDenied(r)) notFound()
  const back = `/admin/galleries/${encodeURIComponent(r.gallery._id)}`

  return (
    <div className="gv-preview">
      <p className="gv-preview-bar" role="note">
        <span><strong>Preview</strong> · this is what the client sees{r.gallery.status === 'draft' ? ' once the gallery is live' : ''}.</span>
        <Link href={back}>Back to gallery</Link>
      </p>
      <GalleryViewer view={await galleryView(r)} />
    </div>
  )
}
