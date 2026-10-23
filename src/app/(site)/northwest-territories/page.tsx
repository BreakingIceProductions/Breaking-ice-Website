import { LocationPage } from '@/components/location-page'
import { getLocation } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const { loc } = await getLocation('northwest-territories')
  return seoMeta(loc?.seo, 'Video production in the NWT', 'Based in Norman Wells and rooted in the Sahtú since 2022: films and photography for airlines, operators, schools, towns and Indigenous governments across the NWT.', { path: '/northwest-territories', eyebrow: 'Northwest Territories', image: loc?.heroImage })
}

export default function NwtPage() {
  return <LocationPage slug="northwest-territories" />
}
