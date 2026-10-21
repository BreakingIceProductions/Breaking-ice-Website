import Link from 'next/link'
import { JsonLd, ORG_ID, breadcrumbLd } from '@/components/json-ld'
import { SITE_URL } from '@/lib/site'
import { notFound } from 'next/navigation'
import { Btn, Eyebrow, Mark, ArrowLink } from '@/components/brand'
import { StoryCard } from '@/components/cards'
import { ProcessCompact } from '@/components/process-compact'
import { ClosingBand, RichText } from '@/components/sections'
import { VideoLoop } from '@/components/video'
import { getProjects, getServiceBySlug, getServices, getSettings } from '@/lib/data'
import { seoMeta } from '@/lib/seo'
import type { PT } from '@/lib/types'
import { CATEGORY_LABELS } from '@/lib/video'
import { urlFor } from '@/sanity/client'

type Props = { params: Promise<{ slug: string }> }

/** Plain text of each block when every block is a [placeholder], so samples keep the placeholder style. */
function placeholderLines(value: PT | undefined): string[] | null {
  if (!value?.length) return null
  const lines = value.map((b) => (b?.children ?? []).map((c: { text?: string }) => c.text ?? '').join(''))
  return lines.every((l) => l.startsWith('[')) ? lines : null
}

export async function generateStaticParams() {
  const services = await getServices()
  return services.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const sv = await getServiceBySlug(slug)
  return sv ? seoMeta(sv.seo, sv.title, `${sv.summary} From Stony Plain, AB and Norman Wells, NT, for organizations across Alberta and the NWT.`, { path: `/services/${sv.slug}`, eyebrow: 'Services', image: sv.cardImage }) : {}
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params
  const [sv, all, s, projects] = await Promise.all([getServiceBySlug(slug), getServices(), getSettings(), getProjects()])
  if (!sv) notFound()
  const related = sv.relatedProjects?.length ? sv.relatedProjects : projects.slice(0, 3)
  const others = all.filter((o) => o.slug !== sv.slug)
  const faq = sv.faq ?? []
  const industries = [...new Set(related.map((p) => p.category).filter((c): c is string => Boolean(c)))]
  const descriptionSample = placeholderLines(sv.description)
  const contactHref = `/contact?type=${encodeURIComponent(sv.slug)}`

  const faqLd = faq.length && !faq[0].question?.startsWith('[')
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
      }
    : null

  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            '@id': `${SITE_URL}/services/${sv.slug}#service`,
            name: sv.title,
            serviceType: sv.title,
            description: sv.summary,
            url: `${SITE_URL}/services/${sv.slug}`,
            provider: { '@id': ORG_ID },
            areaServed: [
              { '@type': 'AdministrativeArea', name: 'Alberta' },
              { '@type': 'AdministrativeArea', name: 'Northwest Territories' },
            ],
          },
          breadcrumbLd([['Services', '/services'], [sv.title, `/services/${sv.slug}`]]),
          ...(faqLd ? [faqLd] : []),
        ]}
      />
      <section className="page-head after-film">
        <div className="wrap">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link> / <Link href="/services">Services</Link> / <span aria-current="page">{sv.title}</span>
          </nav>
          <div className="grid-2" style={{ alignItems: 'center' }}>
            <div className="stack" style={{ gap: 0 }}>
              <Eyebrow>{sv.title} · Alberta & the NWT</Eyebrow>
              <h1 className="h1">{sv.heroHeadline ?? sv.title}</h1>
              <p className="body-lg muted" style={{ margin: '0 0 var(--space-8)' }}>{sv.summary}</p>
              <div className="btn-row">
                <Btn href={contactHref}>{s.primaryCta}</Btn>
                {s.bookingLink ? (
                  <Btn href={s.bookingLink} variant="secondary" external>Book a 20-minute call</Btn>
                ) : (
                  <Btn href="/contact#book" variant="secondary">Book a 20-minute call</Btn>
                )}
              </div>
            </div>
            <VideoLoop
              url={sv.clip}
              posterUrl={sv.cardImage?.asset ? urlFor(sv.cardImage).width(1200).height(900).fit('crop').url() : null}
              posterAlt={sv.cardImage?.alt}
              label={`${sv.title} clip`}
              className="ratio-43"
              priority
            />
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="about-service">
        <div className="wrap split">
          <h2 id="about-service" className="eyebrow">About this service</h2>
          <div className="body-lg">
            <RichText
              value={descriptionSample ? null : sv.description}
              fallback={descriptionSample ?? '[Two or three short paragraphs: what this service is and how it runs.]'}
            />
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="who">
        <div className="wrap split">
          <h2 id="who" className="eyebrow">Who it’s for</h2>
          <div className="body-lg">
            <RichText value={sv.whoItsFor} fallback="[Who this is for, in plain words: the organizations, the situations, the goals. Written for the people searching for it.]" />
            {industries.length > 0 && (
              <ul className="industry-tags" aria-label="Industries we’ve made these for">
                {industries.map((c) => (
                  <li key={c}>
                    <Link href={`/stories?category=${encodeURIComponent(c)}`}>{CATEGORY_LABELS[c] ?? c}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="inc">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div className="stack" style={{ gap: 'var(--space-5)' }}>
            <h2 id="inc" className="eyebrow">What’s included</h2>
            <ul className="included">
              {(sv.included ?? []).map((item, i) => (
                <li key={i} className={item.startsWith('[') ? 'placeholder-text' : undefined}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="panel stack" style={{ gap: 12 }}>
            <span className="eyebrow">Typical timeline</span>
            <p className="h2" style={{ margin: 0 }}>{sv.timeline ?? '[Timeline]'}</p>
            {sv.timelineNote && <p className="muted" style={{ margin: 0 }}>{sv.timelineNote}</p>}
          </div>
        </div>
      </section>

      {s.processSteps?.length > 0 && (
        <section className="section ruled" aria-labelledby="how">
          <div className="wrap">
            <ProcessCompact steps={s.processSteps} />
          </div>
        </section>
      )}

      <section className="section ruled" aria-labelledby="work">
        <div className="wrap">
          <div className="sec-head-row">
            <div className="sec-head">
              <Eyebrow>{sv.title} work</Eyebrow>
              <h2 id="work" className="h2">Stories like this</h2>
            </div>
            <ArrowLink href="/stories">All stories</ArrowLink>
          </div>
          <div className="grid-3">{related.map((p) => <StoryCard key={p._id} p={p} />)}</div>
        </div>
      </section>

      {sv.testimonial && (
        <section className="section ruled" aria-label="Testimonial">
          <div className="wrap">
            <figure className="pull" style={{ margin: 0 }}>
              <Mark size={52} right="var(--ink)" />
              <blockquote>{sv.testimonial.quote}</blockquote>
              <figcaption className="stack" style={{ gap: 2 }}>
                <span className="eyebrow">{sv.testimonial.name}</span>
                <span className="muted">{[sv.testimonial.role, sv.testimonial.organization].filter(Boolean).join(', ')}</span>
              </figcaption>
            </figure>
          </div>
        </section>
      )}

      {faq.length > 0 && (
        <section className="section ruled" aria-labelledby="faq">
          <div className="wrap split">
            <h2 id="faq" className="h2">Questions</h2>
            <div className="faq">
              {faq.map((q, i) => (
                <details key={q._key} open={i === 0}>
                  <summary className={q.question?.startsWith('[') ? 'placeholder-text' : undefined}>{q.question}</summary>
                  <p className={q.answer?.startsWith('[') ? 'placeholder-text' : undefined}>{q.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section ruled" aria-labelledby="others">
        <div className="wrap">
          <h2 id="others" className="eyebrow" style={{ margin: '0 0 var(--space-6)' }}>Other services</h2>
          <div className="pill-links">
            {others.map((o) => (
              <Link key={o._id} href={`/services/${o.slug}`} className="btn btn-secondary">{o.title}</Link>
            ))}
          </div>
        </div>
      </section>

      <ClosingBand s={s} />
    </>
  )
}
