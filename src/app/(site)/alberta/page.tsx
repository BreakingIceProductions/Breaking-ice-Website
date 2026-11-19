import { LocationPage } from '@/components/location-page'
import { getLocation } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const { loc } = await getLocation('alberta')
  return seoMeta(loc?.seo, 'Video production across Alberta', 'Brand and organizational films from Stony Plain, near Edmonton. Films, social videos and photos for organizations across Alberta.', { path: '/alberta', eyebrow: 'Alberta', image: loc?.heroImage })
}

export default function AlbertaPage() {
  return <LocationPage slug="alberta" />
}
