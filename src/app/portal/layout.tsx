import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: 'Client portal', template: '%s · Client portal · Breaking Ice' },
  // Never in search results, before or after launch.
  robots: { index: false, follow: false, nocache: true },
}

export default function PortalRoot({ children }: { children: React.ReactNode }) {
  return <div className="portal">{children}</div>
}
