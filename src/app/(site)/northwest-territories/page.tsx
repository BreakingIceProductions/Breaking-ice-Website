import { LocationPage } from '@/components/location-page'
import { getLocation } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const { loc } = await getLocation('northwest-territories')
  return seoMeta(loc?.seo, 'Video production across the Northwest Territories', 'Based in Norman Wells, rooted in the Sahtú. Video production across the NWT.', { path: '/northwest-territories', eyebrow: 'Northwest Territories', image: loc?.heroImage })
}

export default function NwtPage() {
  return <LocationPage slug="northwest-territories" />
}
