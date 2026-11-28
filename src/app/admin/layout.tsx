import type { Metadata, Viewport } from 'next'
import '../css/admin.css'

export const metadata: Metadata = {
  title: { default: 'Back office', template: '%s · Back office · Breaking Ice' },
  robots: { index: false, follow: false, nocache: true },
  // Saved to the home screen from Safari, the back office opens full screen under its own icon (apple-icon.tsx).
  manifest: '/admin/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Breaking Ice', statusBarStyle: 'black-translucent' },
}

// Full-bleed under the iPhone status bar; the top bar and sidebar pad themselves with the safe-area insets.
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#18202F',
}

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="admin">{children}</div>
}
