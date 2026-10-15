import Image from 'next/image'
import Link from 'next/link'
import { ArrowLink, Btn, Eyebrow, SectionHead, Still } from '@/components/brand'
import { LocationCard, ServiceCard, StoryCard } from '@/components/cards'
import { Checklist, Testimonials } from '@/components/interactive'
import { ClosingBand, Process, RichText } from '@/components/sections'
import { PlayerButton, VideoLoop } from '@/components/video'
import { getHome, getLocation, getServices, getSettings } from '@/lib/data'
import { seoMeta } from '@/lib/seo'
import { urlFor } from '@/sanity/client'

export async function generateMetadata() {
  const h = await getHome()
  return seoMeta(h.seo, 'Breaking Ice Productions · Corporate & brand video, Alberta', h.heroSubline)
}

export default async function HomePage() {
  const [h, s, services, ab, nt] = await Promise.all([getHome(), getSettings(), getServices(), getLocation('alberta'), getLocation('northwest-territories')])
  const poster = h.heroPoster?.asset ? urlFor(h.heroPoster).width(2000).height(1125).fit('crop').url() : null
  const locations = [ab.loc, nt.loc].filter(Boolean)
  const logos = h.logos.length ? h.logos : Array.from({ length: 7 }, (_, i) => ({ _id: `l${i}`, name: '', logo: null }))

  return (
    <>
      {/* Hero: full-bleed reel */}
      <section className="hero dark" aria-label="Introduction">
        <div className="hero-media">
          <VideoLoop url={h.heroReel} posterUrl={poster} posterAlt={h.heroPoster?.alt} label="" onDark priority />
          {!h.heroReel && !poster && (
            <span className="hero-note">Hero reel: add a Vimeo/YouTube link and poster image in the Studio</span>
          )}
        </div>
        <div className="hero-scrim" />
        <div className="wrap hero-content">
          <Eyebrow>{h.heroEyebrow}</Eyebrow>
          <h1 className="display-xl">{h.heroHeadline}</h1>
          <p className="hero-sub">{h.heroSubline}</p>
          <div className="btn-row">
            <Btn href="/contact">{s.primaryCta}</Btn>
            <Btn href="/stories" variant="secondary">{s.secondaryCta}</Btn>
            <PlayerButton url={h.fullReel}>
              <span className="ring" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5l12 7-12 7z" fill="currentColor" /></svg>
              </span>
              Watch the reel
            </PlayerButton>
          </div>
          <div>
            <a href="#intro" className="scroll-cue">Scroll <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </section>

      {/* Intro + stats */}
      <section id="intro" className="section">
        <div className="wrap">
          <div className="split">
            <Eyebrow>{h.introEyebrow}</Eyebrow>
            <p className="intro-copy">{h.introBody}</p>
          </div>
          <dl className="stats" style={{ margin: 'var(--space-16) 0 0' }}>
            {h.stats.map((st, i) => (
              <div className="stat" key={st._key ?? i}>
                <dt className="caption" style={{ order: 2 }}>{st.label}</dt>
                <dd className="stat-value" style={{ margin: 0, order: 1 }}>{st.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Client logos */}
      <section className="section" aria-label="Organizations we’ve worked with" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="divider" style={{ marginBottom: 'var(--space-8)' }}>
            <span className="caption" style={{ letterSpacing: '.18em', textTransform: 'uppercase', fontSize: 12 }}>Trusted by</span>
          </div>
          <div className="logo-strip">
            <div className="logo-track">
              {[...logos, ...logos].map((l, i) => (
                <div className="logo-item" key={`${l._id}-${i}`} aria-hidden={i >= logos.length}>
                  {l.logo?.asset ? (
                    <Image src={urlFor(l.logo).height(80).url()} alt={l.name} width={160} height={40} />
                  ) : (
                    l.name || '[Client logo]'
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How we work */}
      <section className="section ruled" aria-labelledby="process-title">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>How we work</Eyebrow>
            <h2 id="process-title" className="h2">{h.processTitle}</h2>
          </div>
          <Process steps={s.processSteps} />
        </div>
      </section>

      {/* Selected stories */}
      <section className="section ruled" aria-labelledby="stories-title">
        <div className="wrap">
          <div className="sec-head-row">
            <div className="sec-head">
              <Eyebrow>Selected stories</Eyebrow>
              <h2 id="stories-title" className="h2">{h.storiesTitle}</h2>
            </div>
            <ArrowLink href="/stories">All stories</ArrowLink>
          </div>
          <div className="grid-3">
            {h.projects.map((p) => <StoryCard key={p._id} p={p} />)}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section ruled" aria-labelledby="t-title">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>In their words</Eyebrow>
            <h2 id="t-title" className="sr-only">{h.testimonialsTitle}</h2>
          </div>
          <Testimonials items={h.testimonials} />
        </div>
      </section>

      {/* Is this you? */}
      <section className="section ruled" aria-labelledby="check-title">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div className="sec-head" style={{ marginBottom: 0 }}>
            <Eyebrow>Sound familiar?</Eyebrow>
            <h2 id="check-title" className="h1">{h.checklistTitle}</h2>
          </div>
          <Checklist situations={h.situations} closing={h.checklistClosing} cta={s.primaryCta} />
        </div>
      </section>

      {/* Services */}
      <section className="section ruled" aria-labelledby="svc-title">
        <div className="wrap">
          <div className="sec-head-row">
            <div className="sec-head">
              <Eyebrow>Services</Eyebrow>
              <h2 id="svc-title" className="h2">{h.servicesTitle}</h2>
            </div>
            <ArrowLink href="/services">All services</ArrowLink>
          </div>
          <div className="grid-3">
            {services.map((sv) => <ServiceCard key={sv._id} s={sv} />)}
          </div>
        </div>
      </section>

      {/* Founder */}
      <section className="section ruled" aria-labelledby="founder-title">
        <div className="wrap grid-2" style={{ alignItems: 'center' }}>
          <div className="founder-pics">
            <Still image={h.founder?.portrait} label="Portrait" ratio="ratio-45" cut={false} width={700} />
            <Still image={h.founder?.onLocationPhoto} label="On location" ratio="ratio-45" width={700} />
          </div>
          <div className="stack" style={{ gap: 20 }}>
            <Eyebrow>Founder</Eyebrow>
            <h2 id="founder-title" className="h1">{h.founderTitle}</h2>
            <RichText
              value={h.founder?.founderNote}
              fallback={['[A short first-person note from Josh: why this work, why the North, why Alberta now. Two short paragraphs.]']}
            />
            <div>
              <div style={{ fontWeight: 600 }}>{h.founder?.name ?? 'Josh Ferguson'}</div>
              <div className="caption">{h.founder?.role ?? 'Owner & creative director'}</div>
            </div>
            <div className="btn-row">
              <Btn href="/contact">{s.primaryCta}</Btn>
              <Link href="/about" className="link-arrow">About us <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Locations */}
      <section className="section ruled" aria-labelledby="loc-title">
        <div className="wrap">
          <SectionHead eyebrow="Where we work" />
          <h2 id="loc-title" className="sr-only">{h.locationsTitle}</h2>
          <div className="grid-2">
            {locations.map((l) => l && <LocationCard key={l._id} l={l} />)}
          </div>
        </div>
      </section>

      <ClosingBand s={s} />
    </>
  )
}
