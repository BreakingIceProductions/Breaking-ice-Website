import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Pre-launch: block everything.
// Launch day: replace the rules with { userAgent: '*', allow: '/', disallow: ['/studio', '/api'] }.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' }, sitemap: `${SITE_URL}/sitemap.xml` }
}
