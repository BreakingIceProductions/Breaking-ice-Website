import { Eyebrow, ArrowLink } from '@/components/brand'
import { ServiceCard } from '@/components/cards'
import { JsonLd, ORG_ID, breadcrumbLd } from '@/components/json-ld'
import { OfferLadder } from '@/components/offers'
import { ClosingBand, Process } from '@/components/sections'
import { getOffers, getServices, getServicesPage, getSettings, pick } from '@/lib/data'
import { seoMeta } from '@/lib/seo'
import { SITE_URL } from '@/lib/site'
import { COPY } from '@/lib/offers'

export async function generateMetadata() {
  const p = await getServicesPage()
  return seoMeta(p.seo, 'Video production services', COPY.services.metaDescription, { path: '/services', eyebrow: 'Services' })
}

export default async function ServicesPage() {
  const [page, offers, services, s] = await Promise.all([getServicesPage(), getOffers(), getServices(), getSettings()])
  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: page.ladderTitle,
            itemListElement: offers.map((o, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              item: { '@type': 'Service', '@id': `${SITE_URL}/services/${o.slug}#service`, name: o.name, url: `${SITE_URL}/services/${o.slug}`, provider: { '@id': ORG_ID } },
            })),
          },
          breadcrumbLd([['Services', '/services']]),
        ]}
      />
      <section className="page-head">
        <div className="wrap">
          <Eyebrow>{pick(page.eyebrow, 'Services')}</Eyebrow>
          <h1 className="display-xl">{pick(page.headline, 'What we make')}</h1>
          <p className="body-lg muted lede">{page.intro}</p>
        </div>
      </section>

      {/* The three offers lead: a step up from one film to stories all year. */}
      <section className="section flush-top" aria-labelledby="offers-title">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>{page.ladderEyebrow}</Eyebrow>
            <h2 id="offers-title" className="h2">{page.ladderTitle}</h2>
            <p className="body-lg muted lede">{page.ladderIntro}</p>
          </div>
          <OfferLadder offers={offers} />
        </div>
      </section>

      {/* The six existing services, now as the kinds of film we make. */}
      <section className="section ruled svc-overview" aria-labelledby="all-services">
        <div className="wrap">
          <div className="sec-head svc-kinds-head">
            <Eyebrow>{page.kindsEyebrow}</Eyebrow>
            <h2 id="all-services" className="h2">{page.kindsTitle}</h2>
            <p className="body-lg muted lede">{page.kindsIntro}</p>
          </div>
          <div className="svc-list">
            {services.map((sv) => <ServiceCard key={sv._id} s={sv} />)}
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="how">
        <div className="wrap">
          <div className="sec-head-row">
            <div className="sec-head">
              <Eyebrow>How we work</Eyebrow>
              <h2 id="how" className="h2">{pick(page.processTitle, 'Four steps, every time')}</h2>
            </div>
            <ArrowLink href="/about">About us</ArrowLink>
          </div>
          <Process steps={s.processSteps} detail />
        </div>
      </section>
      <ClosingBand s={s} />
    </>
  )
}
