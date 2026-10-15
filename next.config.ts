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
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}

export default nextConfig
