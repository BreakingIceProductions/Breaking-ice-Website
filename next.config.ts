import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Files the share-image route reads at runtime.
  outputFileTracingIncludes: {
    '/og': ['./src/assets/og/**', './public/brand/bi-horizontal-dark.svg'],
    // Fonts for the certificate page on signed quotes.
    '/api/portal/quote/sign': ['./src/portal/fonts/**'],
    '/api/portal/quote/file': ['./src/portal/fonts/**'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.sanity.io' },
      // Vimeo thumbnails used as clip posters (src/lib/vimeo.ts).
      { protocol: 'https', hostname: 'i.vimeocdn.com' },
    ],
  },
  // Old WordPress addresses, so links and search results from the previous site still land.
  async redirects() {
    const story = (from: string, to: string) => ({ source: `/${from}`, destination: `/stories/${to}`, permanent: true })
    return [
      { source: '/photography-services', destination: '/services/photography', permanent: true },
      { source: '/:old(videography-services|digital-rendering-services|web-services)', destination: '/services', permanent: true },
      { source: '/breaking-ice-the-podcast', destination: '/about', permanent: true },
      story('2023-ten-stone-mountain-lodge', 'ten-stone-mountain-lodge-into-the-mackenzie-mountains'),
      story('2023-tenstone-lodge', 'ten-stone-mountain-lodge-into-the-mackenzie-mountains'),
      story('2024-a-case-for-the-mackenzie-valley-highway', 'mackenzie-valley-highway-connecting-the-sahtu'),
      // Every other old project post goes to the stories page.
      { source: '/:old(20\\d\\d-[a-z0-9-]+|ongoing-[a-z0-9-]+)', destination: '/stories', permanent: true },
      { source: '/:old(feed|comments/feed|author/.*|category/.*)', destination: '/', permanent: true },
    ]
  },
  async headers() {
    return [
      // The client portal stays out of search engines for good (keep this one after launch).
      { source: '/portal/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Referrer-Policy', value: 'same-origin' }] },
      // The back office too.
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Referrer-Policy', value: 'same-origin' }] },
    ]
  },
}

export default nextConfig
