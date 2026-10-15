import { LocationPage } from '@/components/location-page'
import { getLocation } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const { loc } = await getLocation('alberta')
  return seoMeta(loc?.seo, 'Video production across Alberta', 'Corporate and brand video from Stony Plain, minutes from Edmonton. Working across Alberta.')
}

export default function AlbertaPage() {
  return <LocationPage slug="alberta" />
}
