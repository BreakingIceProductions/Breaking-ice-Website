import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Files the share-image route reads at runtime.
  outputFileTracingIncludes: {
    '/og': ['./src/assets/og/**', './public/brand/bi-horizontal-dark.svg'],
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.sanity.io' }],
  },
  // Keep the whole site out of search engines until launch day.
  // Remove this header (and robots.ts) when going live.
  async headers() {
    return [
      // The client portal stays out of search engines for good (keep this one after launch).
      { source: '/portal/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Referrer-Policy', value: 'same-origin' }] },
      // The back office too.
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Referrer-Policy', value: 'same-origin' }] },
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}

export default nextConfig
