import { Eyebrow } from '@/components/brand'
import { LocationCard } from '@/components/cards'
import { JsonLd, breadcrumbLd } from '@/components/json-ld'
import { ClosingBand } from '@/components/sections'
import { getLocation, getLocationsPage, getSettings } from '@/lib/data'
import { COPY } from '@/lib/offers'
import { seoMeta } from '@/lib/seo'
import type { Location } from '@/lib/types'

export async function generateMetadata() {
  const p = await getLocationsPage()
  return seoMeta(p.seo, COPY.locations.seoTitle, COPY.locations.seoDescription, { path: '/locations', eyebrow: 'Locations' })
}

/** A few real places from the region's first area group (placeholders left out). */
const placesOf = (l: Location) => (l.areaServed?.[0]?.places ?? []).filter((p) => p && !p.startsWith('[')).slice(0, 4)

/** Both regions on one page; each card leads to its own page with the detail. */
export default async function LocationsPage() {
  const [page, s, ab, nt] = await Promise.all([getLocationsPage(), getSettings(), getLocation('alberta'), getLocation('northwest-territories')])
  const regions = [ab.loc, nt.loc].filter((l): l is Location => Boolean(l))

  return (
    <>
      <JsonLd data={breadcrumbLd([['Locations', '/locations']])} />
      <section className="page-head">
        <div className="wrap">
          <Eyebrow>{page.eyebrow}</Eyebrow>
          <h1 className="display-xl">{page.headline}</h1>
          <p className="body-lg muted lede">{page.intro}</p>
        </div>
      </section>

      <section className="section flush-top" aria-label="Our two regions">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          {regions.map((l) => (
            <LocationCard key={l.slug} l={l} places={placesOf(l)} cta={`${COPY.locations.cardLink} ${l.title}`} headingLevel="h2" />
          ))}
        </div>
      </section>

      <ClosingBand s={s} />
    </>
  )
}
