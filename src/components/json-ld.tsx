import { SITE_NAME, SITE_URL } from '@/lib/site'
import { WHO_WE_ARE } from '@/lib/offers'
import type { Offer, Settings } from '@/lib/types'

/** Structured data for Google. Escapes '<' so CMS text can't break out of the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}

/** Placeholder copy like "[email]" shouldn't reach Google. */
export const real = (v?: string | null) => (v && !v.trim().startsWith('[') ? v.trim() : undefined)

export const ORG_ID = `${SITE_URL}/#organization`

const AREA_SERVED = [
  { '@type': 'AdministrativeArea', name: 'Alberta' },
  { '@type': 'AdministrativeArea', name: 'Northwest Territories' },
]

/**
 * The business, typed as both Organization and ProfessionalService (a LocalBusiness subtype), with the three
 * offers as an OfferCatalog. No prices: the offers carry no price fields on purpose.
 */
export function organizationLd(s: Settings, offers: Offer[] = []) {
  const social = Object.values((s as { social?: Record<string, string | undefined> }).social ?? {}).filter(Boolean)
  return [
    {
      '@context': 'https://schema.org',
      '@type': ['Organization', 'ProfessionalService'],
      '@id': ORG_ID,
      name: SITE_NAME,
      description: WHO_WE_ARE,
      url: SITE_URL,
      // Google wants a square raster logo, at least 112px.
      logo: `${SITE_URL}/brand/bi-icon-512.png`,
      image: `${SITE_URL}/brand/bi-icon-512.png`,
      email: real(s.email),
      telephone: real(s.phone),
      slogan: real(s.tagline),
      foundingDate: '2022',
      founder: { '@type': 'Person', name: 'Josh Ferguson' },
      address: [
        { '@type': 'PostalAddress', addressLocality: 'Stony Plain', addressRegion: 'AB', addressCountry: 'CA' },
        { '@type': 'PostalAddress', addressLocality: 'Norman Wells', addressRegion: 'NT', addressCountry: 'CA' },
      ],
      areaServed: AREA_SERVED,
      knowsAbout: ['Video production', 'Organizational films', 'Brand films', 'Documentary', 'Social media video'],
      hasOfferCatalog: offers.length
        ? {
            '@type': 'OfferCatalog',
            name: 'Ways to work with us',
            itemListElement: offers.map((o) => ({
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                '@id': `${SITE_URL}/services/${o.slug}#service`,
                name: o.name,
                description: o.oneLiner,
                url: `${SITE_URL}/services/${o.slug}`,
                serviceType: 'Video production',
                areaServed: AREA_SERVED,
                provider: { '@id': ORG_ID },
              },
            })),
          }
        : undefined,
      sameAs: social.length ? social : undefined,
    },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL, publisher: { '@id': ORG_ID }, inLanguage: 'en-CA' },
  ]
}

export function breadcrumbLd(items: [name: string, path: string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [['Home', '/'] as [string, string], ...items].map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: `${SITE_URL}${path}`,
    })),
  }
}
