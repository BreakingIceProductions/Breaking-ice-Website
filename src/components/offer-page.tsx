import Link from 'next/link'
import { Btn, Eyebrow, ArrowLink, Still } from '@/components/brand'
import { StoryCard } from '@/components/cards'
import { JsonLd, ORG_ID, breadcrumbLd } from '@/components/json-ld'
import { LeadItem } from '@/components/offers'
import { Filmstrip } from '@/components/home'
import { ClosingBand, RichText } from '@/components/sections'
import { PlayerButton, VideoLoop } from '@/components/video'
import { COPY } from '@/lib/offers'
import { SITE_URL } from '@/lib/site'
import type { Filmstrip as FilmstripData, Offer, ProjectCard, Settings } from '@/lib/types'
import { vimeoPoster } from '@/lib/vimeo'
import { urlFor } from '@/sanity/client'

/** Plain text of a Portable Text value, for structured data. */
const plain = (v?: Offer['description']) =>
  (v ?? []).map((b: { children?: { text?: string }[] }) => (b.children ?? []).map((c) => c.text ?? '').join('')).join(' ').trim()

/**
 * One offer at /services/[slug]: hero, filmstrip (Story Kit only), optional hook video, description, what's included,
 * ideal for, stories, questions, other offers, closing.
 */
export async function OfferPage({
  offer: o,
  others,
  projects,
  faq,
  s,
  filmstrip,
}: {
  offer: Offer
  others: Offer[]
  projects: ProjectCard[]
  faq: { _key: string; question?: string; answer?: string }[]
  s: Settings
  /** The Story Kit filmstrip, shown under the hero when given (the Story Kit page passes it). */
  filmstrip?: FilmstripData | null
}) {
  const c = COPY.offer
  // No stories picked in the Studio: borrow three, starting at a different point for each offer so the pages don't repeat.
  const start = projects.length > 3 ? (((o.order ?? 1) - 1) * 3) % projects.length : 0
  const related = o.relatedProjects?.length ? o.relatedProjects : [...projects.slice(start), ...projects.slice(0, start)].slice(0, 3)
  const contactHref = `/contact?offer=${encodeURIComponent(o.slug)}`
  const cta = o.ctaLabel || s.primaryCta
  // Hero picture: the offer's own still, else a real still from a related story.
  const heroImg = o.heroImage?.asset ? o.heroImage : related.find((p) => p.thumbnail?.asset)?.thumbnail ?? null
  const hookPoster = o.hookVideo ? (o.heroImage?.asset ? urlFor(o.heroImage).width(1600).height(900).fit('crop').url() : await vimeoPoster(o.hookVideo, 1600)) : null
  const description = plain(o.description) || (o.descriptionText ?? []).join(' ') || o.oneLiner
  const url = `${SITE_URL}/services/${o.slug}`

  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            '@id': `${url}#service`,
            name: o.name,
            serviceType: 'Video production',
            description,
            url,
            provider: { '@id': ORG_ID },
            areaServed: [
              { '@type': 'AdministrativeArea', name: 'Alberta' },
              { '@type': 'AdministrativeArea', name: 'Northwest Territories' },
            ],
          },
          breadcrumbLd([['Services', '/services'], [o.name, `/services/${o.slug}`]]),
          ...(faq.length
            ? [{
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: faq.filter((q) => q.question && q.answer).map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
              }]
            : []),
        ]}
      />

      <section className="page-head after-film">
        <div className="wrap">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link> / <Link href="/services">Services</Link> / <span aria-current="page">{o.name}</span>
          </nav>
          <div className="grid-2" style={{ alignItems: 'center' }}>
            <div className="stack" style={{ gap: 0 }}>
              <Eyebrow>{o.name} · Alberta and the NWT</Eyebrow>
              <h1 className="h1">{o.heroHeadline || o.name}</h1>
              {o.oneLiner && <p className="body-lg muted" style={{ margin: '0 0 var(--space-8)' }}>{o.oneLiner}</p>}
              <div className="btn-row">
                <Btn href={contactHref}>{cta}</Btn>
                {s.bookingLink && <Btn href={s.bookingLink} variant="secondary" external>Book a 20-minute call</Btn>}
              </div>
            </div>
            <Still image={heroImg} label={o.name} ratio="ratio-43" width={1200} priority />
          </div>
        </div>
      </section>

      {filmstrip && <Filmstrip data={filmstrip} id="offer-filmstrip-title" />}

      {o.hookVideo && (
        <section className="section ruled" aria-labelledby="hook">
          <div className="wrap hook-film">
            <VideoLoop url={o.hookVideo} posterUrl={hookPoster} label={`${o.name} film`} className="ratio-169" />
            <div className="stack" style={{ gap: 'var(--space-4)' }}>
              <h2 id="hook" className="eyebrow">{c.hookTitle}</h2>
              <PlayerButton url={o.hookVideo} trackAs={`${o.name} hook`}>
                <span className="ring" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5l12 7-12 7z" fill="currentColor" /></svg>
                </span>
                Watch with sound
              </PlayerButton>
            </div>
          </div>
        </section>
      )}

      <section className="section ruled" aria-labelledby="about-offer">
        <div className="wrap split">
          <h2 id="about-offer" className="eyebrow">{o.name}</h2>
          <div className="body-lg">
            <RichText value={o.description} fallback={o.descriptionText} />
            {o.descriptionNote && <p className="offer-desc-note">{o.descriptionNote}</p>}
          </div>
        </div>
      </section>

      <section className="section ruled" aria-label={`${o.includedTitle || c.includedTitle} and ${c.idealForTitle}`}>
        <div className="wrap offer-lists">
          <div className="stack" style={{ gap: 'var(--space-5)' }}>
            <h2 className="eyebrow">{o.includedTitle || c.includedTitle}</h2>
            <ul className="included">
              {(o.included ?? []).map((item, i) => <li key={i}><LeadItem text={item} /></li>)}
            </ul>
            {o.timeline && (
              <div className="panel stack" style={{ gap: 12, marginTop: 'var(--space-6)' }}>
                <span className="eyebrow">{c.timelineTitle}</span>
                <p className="h2" style={{ margin: 0 }}>{o.timeline}</p>
                {o.timelineNote && <p className="muted" style={{ margin: 0 }}>{o.timelineNote}</p>}
              </div>
            )}
          </div>
          <div className="stack" style={{ gap: 'var(--space-5)' }}>
            <h2 className="eyebrow">{c.idealForTitle}</h2>
            <ul className="ideal-list">
              {(o.idealFor ?? []).map((item, i) => <li key={i}>{item}</li>)}
            </ul>
            {o.relatedServices?.length ? (
              <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
                <span className="label">{c.kindsTitle}</span>
                <div className="pill-links">
                  {o.relatedServices.map((sv) => (
                    <Link key={sv._id} href={`/services/${sv.slug}`} className="btn btn-secondary">{sv.title}</Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="section ruled" aria-labelledby="work">
          <div className="wrap">
            <div className="sec-head-row">
              <div className="sec-head">
                <Eyebrow>{o.name}</Eyebrow>
                <h2 id="work" className="h2">{c.storiesTitle}</h2>
              </div>
              <ArrowLink href="/stories">All stories</ArrowLink>
            </div>
            <div className="grid-3">{related.map((p) => <StoryCard key={p._id} p={p} />)}</div>
          </div>
        </section>
      )}

      {faq.length > 0 && (
        <section className="section ruled" aria-labelledby="faq">
          <div className="wrap split">
            <div className="stack" style={{ gap: 'var(--space-4)' }}>
              <h2 id="faq" className="h2">{c.faqTitle}</h2>
              <ArrowLink href="/faq">All questions</ArrowLink>
            </div>
            <div className="faq">
              {faq.map((q, i) => (
                <details key={q._key} open={i === 0}>
                  <summary>{q.question}</summary>
                  <p>{q.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="section ruled" aria-labelledby="others">
          <div className="wrap">
            <h2 id="others" className="eyebrow" style={{ margin: '0 0 var(--space-6)' }}>{c.otherOffersTitle}</h2>
            <div className="pill-links">
              {others.map((x) => (
                <Link key={x._id} href={`/services/${x.slug}`} className="btn btn-secondary">{x.name}</Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <ClosingBand s={s} headline={o.closingHeadline} ctaHref={contactHref} secondary={false} />
    </>
  )
}
