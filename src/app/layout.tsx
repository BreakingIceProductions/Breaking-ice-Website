import type { Metadata, Viewport } from 'next'
import { Archivo, Newsreader } from 'next/font/google'
import './globals.css'

// Only the Latin subset is preloaded (covers é, á, ú, as in Sahtú). Fewer bytes before the headline paints.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
})

const newsreader = Newsreader({
  subsets: ['latin'],
  style: 'italic',
  weight: '400', // one static weight: much smaller than the variable font
  variable: '--font-newsreader',
  display: 'swap',
  // Accent face only: don't let it compete with the page for bandwidth.
  preload: false,
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://breakingiceproductions.com'),
  title: { default: 'Breaking Ice Productions', template: '%s · Breaking Ice Productions' },
  description: 'Video production for the human stories inside organizations. Alberta and the Northwest Territories.',
  // Pre-launch: keep everything out of search engines.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF7F2' },
    { media: '(prefers-color-scheme: dark)', color: '#18202F' },
  ],
}

// Runs before the page paints, so a dark-mode visitor never sees a white flash.
const themeScript = `(function(){try{var t=localStorage.getItem('bi-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${archivo.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
