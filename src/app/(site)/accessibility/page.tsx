import { LegalPage } from '@/components/legal-page'
import { getLegal } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const doc = await getLegal('accessibility')
  return seoMeta(doc?.seo, 'Accessibility', 'How the Breaking Ice Productions site works with keyboards, screen readers and reduced motion, and how to tell us when something doesn’t work for you.', { path: '/accessibility', eyebrow: 'Legal' })
}

export default function AccessibilityPage() {
  return <LegalPage slug="accessibility" title="Accessibility" />
}
