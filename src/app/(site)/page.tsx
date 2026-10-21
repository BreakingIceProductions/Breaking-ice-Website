import Image from 'next/image'
import { ArrowLink, Btn, Eyebrow, Lockup, Still } from '@/components/brand'
import { LocationCard, ServiceCard, StoryCard } from '@/components/cards'
import { Checklist, Testimonials } from '@/components/interactive'
import { ClosingBand, Process, RichText } from '@/components/sections'
import { ReturnCalculator } from '@/components/return-calculator'
import { SplitHeading } from '@/components/split-heading'
import { SwipeRail } from '@/components/swipe-rail'
import { PlayerButton, VideoLoop } from '@/components/video'
import { getHome, getLocation, getServices, getSettings } from '@/lib/data'
import { seoMeta } from '@/lib/seo'
import { urlFor } from '@/sanity/client'

export async function generateMetadata() {
  const h = await getHome()
  return seoMeta(h.seo, 'Breaking Ice Productions · Video in Alberta & the NWT', h.heroSubline, { path: '/', eyebrow: 'Video production · Alberta & the NWT' })
}

/**
 * Logos read as the same size when they cover about the same area, not when they share a height:
 * a 16:1 wordmark and a square crest need different boxes. Height follows the aspect ratio, within limits.
 */
function logoBox(ar = 3) {
  // Steeper than equal-area so long, heavy wordmarks don't dominate; crests get the most height.
  const h = Math.min(58, Math.max(14, 62 * ar ** -0.55))
  return { w: Math.round(h * ar), h: Math.round(h) }
}

export default async function HomePage() {
  const [h, s, services, ab, nt] = await Promise.all([getHome(), getSettings(), getServices(), getLocation('alberta'), getLocation('northwest-territories')])
  const poster = h.heroPoster?.asset ? urlFor(h.heroPoster).width(2000).height(1125).fit('crop').url() : null
  const locations = [ab.loc, nt.loc].filter(Boolean)
  const logos = h.logos.length ? h.logos : Array.from({ length: 7 }, (_, i) => ({ _id: `l${i}`, name: '', logo: null, ar: undefined as number | undefined }))

  return (
    <>
      {/* Calm first screen: just the name, then the film */}
      <section className="splash" aria-label="Breaking Ice Productions">
        <Lockup variant="vertical" height={300} className="splash-logo" />
        <p className="splash-line">{h.heroEyebrow}</p>
        {/* Phones only: one quiet way in, without scrolling. */}
        <ArrowLink href="/contact" className="splash-cta">{s.primaryCta}</ArrowLink>
        <a href="#film" className="scroll-cue splash-cue">Scroll to explore <span aria-hidden="true">↓</span></a>
      </section>

      {/* Hero: the reel, contained in a soft frame */}
      <section id="film" className="hero-contained" aria-label="Introduction">
        <div className="wrap">
          <div className="hero-head">
            <SplitHeading as="h1" className="display-xl" text={h.heroHeadline} />
            <div className="hero-aside">
              <p className="hero-sub">{h.heroSubline}</p>
              <div className="btn-row">
                <Btn href="/contact">{s.primaryCta}</Btn>
                <Btn href="/stories" variant="secondary">{s.secondaryCta}</Btn>
                <PlayerButton url={h.fullReel} trackAs="Showreel">
                  <span className="ring" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5l12 7-12 7z" fill="currentColor" /></svg>
                  </span>
                  Watch the reel
                </PlayerButton>
              </div>
            </div>
          </div>
          <div className="hero-frame">
            <VideoLoop url={h.heroReel} posterUrl={poster} posterAlt={h.heroPoster?.alt} label="" className="ratio-169" onDark priority />
            {!h.heroReel && !poster && (
              <span className="hero-note">Hero reel: add a Vimeo/YouTube link and poster image in the Studio</span>
            )}
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
          <dl className="stats">
            {h.stats.map((st, i) => (
              <div className="stat" key={st._key ?? i}>
                <dt className="caption">{st.label}</dt>
                <dd className="stat-value">{st.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Client logos */}
      <section className="section flush-top" aria-labelledby="logos-title">
        <div className="wrap">
          <h2 id="logos-title" className="sr-only">{h.logoStripTitle}</h2>
          <div className="divider" style={{ marginBottom: 'var(--space-8)' }}>
            <span className="label">{h.logoStripEyebrow}</span>
          </div>
          <div className="logo-strip">
            <div className="logo-track">
              {[...logos, ...logos].map((l, i) => (
                <div className={`logo-item${i >= logos.length ? ' logo-dup' : ''}`} key={`${l._id}-${i}`} aria-hidden={i >= logos.length}>
                  {l.logo?.asset ? (
                    (() => {
                      const { w, h } = logoBox(l.ar)
                      return <Image src={urlFor(l.logo).height(Math.round(h * 2)).url()} alt={l.name} width={w} height={h} style={{ width: w, height: h }} />
                    })()
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
            <Eyebrow>{h.processEyebrow}</Eyebrow>
            <h2 id="process-title" className="h2">{h.processTitle}</h2>
          </div>
          <SwipeRail className="home-rail">
            <Process steps={s.processSteps} />
          </SwipeRail>
        </div>
      </section>

      {/* Selected stories */}
      <section className="section ruled" aria-labelledby="stories-title">
        <div className="wrap">
          <div className="sec-head-row">
            <div className="sec-head">
              <Eyebrow>{h.storiesEyebrow}</Eyebrow>
              <h2 id="stories-title" className="h2">{h.storiesTitle}</h2>
            </div>
            <ArrowLink href="/stories">All stories</ArrowLink>
          </div>
          <SwipeRail className="home-rail">
            <div className="grid-3">
              {h.projects.map((p) => <StoryCard key={p._id} p={p} />)}
            </div>
          </SwipeRail>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section ruled" aria-labelledby="t-title">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>{h.testimonialsEyebrow}</Eyebrow>
            <h2 id="t-title" className="h2">{h.testimonialsTitle}</h2>
          </div>
          <Testimonials items={h.testimonials} />
        </div>
      </section>

      {/* What a film could be worth */}
      <section className="section calc-band" aria-labelledby="calc-title">
        <div className="wrap wrap-narrow">
          <div className="sec-head center">
            <Eyebrow>The return</Eyebrow>
            <SplitHeading as="h2" className="h2" text="A film that earns its keep. See what that could be worth over a year." />
            <p className="hero-sub" style={{ margin: 0 }}>Move the sliders to your own numbers. It is the same maths we walk through together when we talk.</p>
          </div>
          <ReturnCalculator cta={s.primaryCta} />
        </div>
      </section>

      {/* Is this you? */}
      <section className="section ruled" aria-labelledby="check-title">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div className="sec-head" style={{ marginBottom: 0 }}>
            <Eyebrow>{h.checklistEyebrow}</Eyebrow>
            <h2 id="check-title" className="h2">{h.checklistTitle}</h2>
          </div>
          <Checklist situations={h.situations} closing={h.checklistClosing} cta={s.primaryCta} />
        </div>
      </section>

      {/* Services */}
      <section className="section ruled" aria-labelledby="svc-title">
        <div className="wrap">
          <div className="sec-head-row">
            <div className="sec-head">
              <Eyebrow>{h.servicesEyebrow}</Eyebrow>
              <h2 id="svc-title" className="h2">{h.servicesTitle}</h2>
            </div>
            <ArrowLink href="/services">All services</ArrowLink>
          </div>
          {/* Phones: a swipe rail like stories and process, so six cards don't stack into one long column. */}
          <SwipeRail className="home-rail">
            <div className="grid-3">
              {services.map((sv) => <ServiceCard key={sv._id} s={sv} />)}
            </div>
          </SwipeRail>
        </div>
      </section>

      {/* Founder */}
      <section className="section ruled" aria-labelledby="founder-title">
        <div className="wrap grid-2" style={{ alignItems: 'center' }}>
          <div className="founder-pics">
            <div className="founder-portrait">
              <Still image={h.founder?.portrait} label="Portrait" ratio="ratio-45" width={900} />
            </div>
            <div className="founder-location">
              <Still image={h.founder?.onLocationPhoto} label="On location" ratio="ratio-169" width={900} />
            </div>
          </div>
          <div className="stack" style={{ gap: 'var(--space-5)' }}>
            <Eyebrow>{h.founderEyebrow}</Eyebrow>
            <h2 id="founder-title" className="h2">{h.founderTitle}</h2>
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
              <ArrowLink href="/about">About us</ArrowLink>
            </div>
          </div>
        </div>
      </section>

      {/* Locations */}
      <section className="section ruled" aria-labelledby="loc-title">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>{h.locationsEyebrow}</Eyebrow>
            <h2 id="loc-title" className="h2">{h.locationsTitle}</h2>
          </div>
          <div className="grid-2">
            {locations.map((l) => l && <LocationCard key={l._id} l={l} />)}
          </div>
        </div>
      </section>

      <ClosingBand s={s} />
    </>
  )
}
