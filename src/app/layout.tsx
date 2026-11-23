import type { Metadata, Viewport } from 'next'
import { Archivo, Newsreader } from 'next/font/google'
import { SITE_URL } from '@/lib/site'
import './globals.css'
import './css/pages.css'
import './css/story.css'
import './css/services.css'

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
  metadataBase: new URL(SITE_URL),
  title: { default: 'Breaking Ice Productions', template: '%s · Breaking Ice Productions' },
  description: 'Video production for the human stories inside organizations. Alberta and the Northwest Territories.',
  // Live: public pages are open to search engines. Private areas (admin, portal, review, sign, galleries) set their own noindex.
  robots: { index: true, follow: true },
  // Google Search Console ownership (URL-prefix property). Keep this tag: removing it unverifies the site.
  verification: { google: 'l-2p_QFvj0SpWYpVjbbFciax45R5AxCj3S1ge9CJZP8' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#18202F' },
  ],
}

// Runs before the page paints, so a dark-mode visitor never sees a white flash.
const themeScript = `(function(){try{var t=localStorage.getItem('bi-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-scroll-behavior="smooth": Next turns smooth scrolling off during route changes, so Back restores the
    // scroll position instantly instead of animating from the top. In-page anchors stay smooth (globals.css).
    <html lang="en-CA" className={`${archivo.variable} ${newsreader.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
