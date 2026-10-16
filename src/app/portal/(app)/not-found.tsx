import Link from 'next/link'
import { EmptyMark } from '@/portal/ui'

export default function PortalNotFound() {
  return (
    <div className="wrap p-empty-page">
      <EmptyMark />
      <h1 className="h2">We couldn’t find that project</h1>
      <p className="muted">It may have been renamed, or it belongs to a different email address.</p>
      <Link className="btn btn-primary" href="/portal">Back to your projects</Link>
    </div>
  )
}
