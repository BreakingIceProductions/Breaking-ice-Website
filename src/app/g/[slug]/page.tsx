import type { Metadata } from 'next'
import { after } from 'next/server'
import { Logo } from '@/components/brand'
import { galleryView, isDenied, resolveGallery, statsWho } from '@/galleries/access'
import { recordView } from '@/galleries/store'
import { GalleryViewer } from '@/galleries/ui/gallery-viewer'
import '@/galleries/gallery.css'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ wrong?: string }> }

// Never in search results, and the link itself isn't sent on to other sites.
export const metadata: Metadata = { title: 'Photos', robots: { index: false, follow: false, nocache: true }, referrer: 'same-origin' }

/**
 * A gallery's public share link. Anyone with the link can look while sharing is on and the
 * gallery is open; a password, if set, is asked once (remembered for 30 days on that device).
 * Closed, switched-off and unknown links all get a plain, friendly message.
 */
export default async function SharedGallery({ params, searchParams }: Props) {
  const { slug } = await params
  const { wrong } = await searchParams
  const r = await resolveGallery('share', slug)

  if (!isDenied(r) && !r.readOnly) {
    const who = statsWho(r)
    // Counted after the page is sent: a slow write never holds up the photos.
    if (who) after(() => recordView(r.gallery._id, who).catch((e) => console.error('[galleries] view not recorded', e)))
  }

  return (
    <div className="gv-page">
      <header className="gv-head">
        <span className="logo-for-light"><Logo tone="light" height={28} /></span>
        <span className="logo-for-dark"><Logo tone="dark" height={28} /></span>
        <span className="small muted">Photos</span>
      </header>
      <main id="main">
        {!isDenied(r) ? (
          <GalleryViewer view={await galleryView(r)} />
        ) : r.denied === 'locked' && r.gallery ? (
          <div className="gv-gate">
            <h1>{r.gallery.title}</h1>
            <p className="muted">This gallery has a password. If you don’t have it, ask whoever sent you the link.</p>
            <form action="/api/galleries/unlock" method="post">
              <input type="hidden" name="slug" value={slug} />
              <div className="field">
                <label htmlFor="gv-pw">Password</label>
                <input id="gv-pw" className="input" type="password" name="password" autoComplete="current-password" required autoFocus aria-invalid={wrong ? true : undefined} aria-describedby={wrong ? 'gv-pw-err' : undefined} />
              </div>
              {wrong && (
                <p id="gv-pw-err" className="gv-error" role="alert">
                  {wrong === 'limit' ? 'Too many tries. Please wait a few minutes and try again.' : 'That password didn’t match. Please check it and try again.'}
                </p>
              )}
              <button className="btn btn-primary" type="submit">Open gallery</button>
            </form>
          </div>
        ) : r.denied === 'closed' ? (
          <div className="gv-gate">
            <h1>This gallery has closed</h1>
            <p className="muted">{r.gallery ? `${r.gallery.title} was open for a limited time.` : 'It was open for a limited time.'} If you still need these photos, reply to the email the link came in and Josh will sort it out.</p>
          </div>
        ) : (
          <div className="gv-gate">
            <h1>This link isn’t active</h1>
            <p className="muted">It may have been switched off or replaced with a new one. Ask the person who sent it for a fresh link.</p>
          </div>
        )}
      </main>
    </div>
  )
}
