import type { MetadataRoute } from 'next'
import { getProjects, getServices } from '@/lib/data'
import { SITE_URL } from '@/lib/site'

export const revalidate = 3600

/** Every public page. Google reads this once robots.txt points at it (launch day). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [projects, services] = await Promise.all([getProjects(), getServices()])
  const now = new Date()
  const page = (path: string, priority: number, changeFrequency: 'weekly' | 'monthly' | 'yearly' = 'monthly') => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  })
  return [
    page('/', 1, 'weekly'),
    page('/services', 0.9),
    ...services.map((s) => page(`/services/${s.slug}`, 0.9)),
    page('/alberta', 0.9),
    page('/northwest-territories', 0.8),
    page('/stories', 0.8, 'weekly'),
    ...projects.map((p) => page(`/stories/${p.slug}`, 0.7)),
    page('/about', 0.6),
    page('/contact', 0.7),
    page('/privacy', 0.2, 'yearly'),
    page('/accessibility', 0.2, 'yearly'),
  ]
}
