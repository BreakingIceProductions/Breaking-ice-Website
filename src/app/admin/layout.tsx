import type { Metadata } from 'next'
import '../css/admin.css'

export const metadata: Metadata = {
  title: { default: 'Back office', template: '%s · Back office · Breaking Ice' },
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="admin">{children}</div>
}
