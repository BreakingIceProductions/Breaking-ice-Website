import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Logo } from '@/components/brand'
import { versionLabel } from '@/portal/library'
import { findShare } from '@/portal/review'
import { GuestRoom } from './guest-room'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

// Never in search results, and the link itself isn't sent on to other sites.
export const metadata: Metadata = { title: 'Review', robots: { index: false, follow: false, nocache: true }, referrer: 'same-origin' }

/**
 * A guest's door into the review room: a per-version share link the owner made.
 * Guests give a name once (kept in a cookie for this link only) and can comment and reply.
 * Approving and asking for changes stay with the client's signed-in contacts.
 */
export default async function ReviewShare({ params }: Props) {
  const { token } = await params
  const target = await findShare(token)
  const jar = await cookies()
  const name = jar.get('bi_rv_name')?.value ?? ''
  const id = jar.get('bi_rv_id')?.value ?? ''

  return (
    <div className="rv-page">
      <header className="rv-head">
        <span className="logo-for-light"><Logo tone="light" height={28} /></span>
        <span className="logo-for-dark"><Logo tone="dark" height={28} /></span>
        <span className="small muted">Review room</span>
      </header>
      <main className="rv-body" id="main">
        {target ? (
          <>
            <div className="rv-title">
              <p className="small muted">{target.org} · {target.projectTitle}</p>
              <h1>{target.d.title} <span className="muted">· {versionLabel(target.d)}</span></h1>
            </div>
            <GuestRoom
              token={token}
              initialName={decodeURIComponent(name).slice(0, 60)}
              initialId={/^[A-Za-z0-9_-]{16,64}$/.test(id) ? id : ''}
              room={{
                deliverableKey: target.d._key,
                title: target.d.title,
                versionLabel: versionLabel(target.d),
                fps: target.d.fps ?? 23.976,
                duration: target.d.durationSec,
                status: target.d.status,
                note: target.d.notes,
                crumbs: [target.org, target.projectTitle],
              }}
            />
          </>
        ) : (
          <div className="rv-gate">
            <h1 className="rr-h" style={{ fontSize: 22 }}>This link isn’t active</h1>
            <p className="muted" style={{ margin: 0 }}>It may have been switched off or replaced with a new one. Ask the person who sent it for a fresh link.</p>
          </div>
        )}
      </main>
    </div>
  )
}
