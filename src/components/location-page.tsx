import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Btn, Eyebrow, Still } from '@/components/brand'
import { StoryCard } from '@/components/cards'
import { ClosingBand, PhoneLink, RichText } from '@/components/sections'
import { JsonLd, ORG_ID, breadcrumbLd, real } from '@/components/json-ld'
import { getLocation, getSettings, pick } from '@/lib/data'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { urlFor } from '@/sanity/client'

export async function LocationPage({ slug }: { slug: string }) {
  const [{ loc, projects }, s] = await Promise.all([getLocation(slug), getSettings()])
  if (!loc) notFound()
  const other = s.locations.find((l) => l.slug !== slug)
  // A local business entry per region, tied to the main organization (helps the Google map pack).
  const places = (loc.areaServed ?? []).flatMap((g) => g.places ?? []).filter((p) => real(p))
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${SITE_URL}/${slug}#business`,
    // The exact business name; the region comes through areaServed and address.
    name: SITE_NAME,
    url: `${SITE_URL}/${slug}`,
    image: loc.heroImage?.asset ? urlFor(loc.heroImage).width(1200).url() : `${SITE_URL}/brand/bi-icon-512.png`,
    parentOrganization: { '@id': ORG_ID },
    description: `Corporate and brand video production across ${loc.title}.`,
    email: real(loc.email) ?? real(s.email),
    telephone: real(loc.phone) ?? real(s.phone),
    areaServed: [{ '@type': 'AdministrativeArea', name: loc.title }, ...places.map((name) => ({ '@type': 'Place', name }))],
    address: loc.base
      ? { '@type': 'PostalAddress', addressLocality: loc.base.split(',')[0].trim(), addressRegion: loc.base.split(',')[1]?.trim(), addressCountry: 'CA' }
      : undefined,
  }

  return (
    <>
      <JsonLd data={[ld, breadcrumbLd([[loc.title, `/${slug}`]])]} />
      <section className="page-head">
        <div className="wrap grid-2" style={{ alignItems: 'center' }}>
          <div className="stack">
            <Eyebrow>{loc.baseLine}</Eyebrow>
            <h1 className="h1">{loc.headline ?? `Video production across ${loc.title}`}</h1>
            <div className="body-lg muted">
              <RichText
                value={loc.intro}
                fallback={
                  slug === 'alberta'
                    ? '[Intro: based in Stony Plain, minutes from Edmonton. Who we work with across Alberta, and what it’s like to film here.]'
                    : '[Intro: based in Norman Wells, rooted in the Sahtú. Who we work with across the Northwest Territories.]'
                }
              />
            </div>
            <dl className="panel" style={{ margin: 'var(--space-6) 0 var(--space-8)', padding: 'var(--space-6)', display: 'flex', flexWrap: 'wrap', gap: '8px 32px' }}>
              <div><dt className="caption">Base</dt><dd style={{ margin: 0, fontWeight: 600 }}>{loc.base}</dd></div>
              <div><dt className="caption">Email</dt><dd style={{ margin: 0 }}><a className="text-link" href={`mailto:${pick(loc.email, s.email)}`}>{pick(loc.email, s.email)}</a></dd></div>
              <div><dt className="caption">Phone</dt><dd style={{ margin: 0 }}><PhoneLink className="text-link" phone={pick(loc.phone, s.phone)} /></dd></div>
            </dl>
            <div className="btn-row">
              <Btn href="/contact">{s.primaryCta}</Btn>
              <Btn href="/stories" variant="secondary">{s.secondaryCta}</Btn>
            </div>
          </div>
          <Still image={loc.heroImage} label={`${loc.title}: hero image`} ratio="ratio-45" width={1000} priority />
        </div>
      </section>

      {projects.length > 0 && (
        <section className="section ruled" aria-labelledby="local">
          <div className="wrap">
            <div className="sec-head-row">
              <div className="sec-head">
                <Eyebrow>{pick(loc.storiesEyebrow, 'Stories from here')}</Eyebrow>
                <h2 id="local" className="h2">{pick(loc.storiesTitle, `Work in ${loc.title}`)}</h2>
              </div>
              <Link className="link-arrow" href="/stories">All stories <span aria-hidden="true">→</span></Link>
            </div>
            <div className="grid-3">{projects.map((p) => <StoryCard key={p._id} p={p} />)}</div>
          </div>
        </section>
      )}

      <section className="section ruled" aria-labelledby="area">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div className="stack" style={{ gap: 16 }}>
            <Eyebrow>{pick(loc.areaEyebrow, 'Area served')}</Eyebrow>
            <h2 id="area" className="h2">{pick(loc.areaTitle, `Where we go from ${loc.base?.split(',')[0] ?? loc.title}`)}</h2>
            <p className={`muted ${loc.travelNote?.startsWith('[') ? 'placeholder-text' : ''}`} style={{ margin: 0 }}>{loc.travelNote}</p>
            <div className="area-groups" style={{ marginTop: 'var(--space-6)' }}>
              {(loc.areaServed ?? []).map((g) => (
                <div key={g._key}>
                  <h3 className="caption" style={{ margin: 0, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 12 }}>{g.name}</h3>
                  <ul className="places">
                    {(g.places ?? []).map((pl) => <li key={pl}>{pl}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <Still image={loc.mapImage} label="Map of the area served" ratio="ratio-43" />
        </div>
      </section>

      {other && (
        <div className="wrap" style={{ paddingBottom: 'var(--space-16)', display: 'flex', justifyContent: 'flex-end' }}>
          <Link className="link-arrow" href={`/${other.slug}`}>Also: {other.title} <span aria-hidden="true">→</span></Link>
        </div>
      )}
      <ClosingBand s={s} headline={loc.closingHeadline} secondary={false} />
    </>
  )
}
