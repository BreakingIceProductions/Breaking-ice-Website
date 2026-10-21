import { LegalPage } from '@/components/legal-page'
import { getLegal } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const doc = await getLegal('privacy')
  return seoMeta(doc?.seo, 'Privacy', 'How Breaking Ice Productions handles what you send through this site: contact form messages, privacy-friendly analytics and Vimeo video.', { path: '/privacy', eyebrow: 'Legal' })
}

export default function PrivacyPage() {
  return <LegalPage slug="privacy" title="Privacy" />
}
