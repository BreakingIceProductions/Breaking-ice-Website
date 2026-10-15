import type { MetadataRoute } from 'next'

// Pre-launch: block everything. On launch day allow '/', disallow '/studio', and add the sitemap.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } }
}
