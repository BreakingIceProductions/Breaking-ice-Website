import type { Metadata, Viewport } from 'next'
import { Archivo, Newsreader } from 'next/font/google'
import './globals.css'

const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
})

const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  style: 'italic',
  axes: ['opsz'],
  variable: '--font-newsreader',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://breakingiceproductions.com'),
  title: { default: 'Breaking Ice Productions', template: '%s · Breaking Ice Productions' },
  description: 'Video production for the human stories inside organizations. Alberta and the Northwest Territories.',
  // Pre-launch: keep everything out of search engines.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#18202F' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${archivo.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  )
}
