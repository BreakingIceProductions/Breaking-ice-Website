/* eslint-disable @next/next/no-img-element -- covers are short-lived signed R2 addresses */
import Link from 'next/link'
import { viewUrl } from '@/galleries/files'
import { galleriesForClients } from '@/galleries/store'
import { daysLeft, isExpired } from '@/galleries/types'
import { longDate, plural } from '@/galleries/ui/format'
import { requireAccess } from '@/portal/current'
import { EmptyMark } from '@/portal/ui'
import '@/galleries/gallery.css'

export const metadata = { title: 'Photo galleries' }

/** The signed-in client's photo galleries, newest first. Closed ones stay listed (unlinked) so nobody wonders where they went. */
export default async function Galleries() {
  const { clients } = await requireAccess()
  const galleries = await galleriesForClients(clients.map((c) => c._id))

  return (
    <div className="wrap">
      <section className="p-hello">
        <span className="eyebrow">Photos</span>
        <h1 className="h1">Your galleries</h1>
        {galleries.length > 0 && <p className="body-lg muted" style={{ margin: 0 }}>Open a gallery to see every photo, heart your favourites and download what you need.</p>}
      </section>

      {galleries.length ? (
        <ul className="gv-list">
          {galleries.map((g) => {
            const cover = g.photos.find((p) => p._key === g.coverKey) ?? g.photos[0]
            const closed = isExpired(g)
            const left = daysLeft(g)
            const meta = [longDate(g.date), plural(g.photos.length, 'photo')].filter(Boolean).join(' · ')
            const body = (
              <>
                <div className="gv-card-img">
                  {cover && <img src={viewUrl(g, cover, 'thumb')} alt="" loading="lazy" decoding="async" width={cover.w} height={cover.h} />}
                </div>
                <div>
                  <h2 className="gv-card-title">{g.title}</h2>
                  <p className="gv-card-meta">{meta}</p>
                  {closed ? (
                    <p className="gv-card-meta">Closed. Reply to any of our emails if you still need these.</p>
                  ) : g.expiresOn ? (
                    <p className="gv-card-meta">
                      Open until {longDate(g.expiresOn)}
                      {left !== null && left <= 14 && <span className="soon"> · {left === 0 ? 'closes today' : left === 1 ? 'closes tomorrow' : `closes in ${left} days`}</span>}
                    </p>
                  ) : null}
                </div>
              </>
            )
            return <li key={g._id}>{closed ? <div className="gv-card" aria-disabled="true">{body}</div> : <Link className="gv-card" href={`/portal/galleries/${encodeURIComponent(g._id)}`}>{body}</Link>}</li>
          })}
        </ul>
      ) : (
        <div className="p-empty">
          <EmptyMark />
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>No photo galleries yet</p>
            <p className="muted small" style={{ margin: 0 }}>When we deliver photos from a shoot, they’ll show up here.</p>
          </div>
        </div>
      )}
    </div>
  )
}
