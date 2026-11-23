import { ArrowLink, Btn, Eyebrow, Lockup } from '@/components/brand'
import { CrewSection, FeaturedStories, Filmstrip, FitSection, LogoStrip } from '@/components/home'
import { Testimonials } from '@/components/interactive'
import { OfferLadder } from '@/components/offers'
import { ClosingBand } from '@/components/sections'
import { SplitHeading } from '@/components/split-heading'
import { PlayerButton, VideoLoop } from '@/components/video'
import { getCrew, getFilmstrip, getHome, getOffers, getSettings } from '@/lib/data'
import { seoMeta } from '@/lib/seo'
import { vimeoPoster } from '@/lib/vimeo'
import { urlFor } from '@/sanity/client'

export async function generateMetadata() {
  const h = await getHome()
  return seoMeta(h.seo, 'Breaking Ice Productions · Video in Alberta & the NWT', h.heroSubline, { path: '/', eyebrow: 'Video production · Alberta & the NWT' })
}

const PlayRing = () => (
  <span className="ring" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5l12 7-12 7z" fill="currentColor" /></svg>
  </span>
)

/**
 * Home, in order (Josh's Nov 21 wireframe): logo splash · headline, reel and buttons · the problem · the ladder ·
 * (client logo strip right under the reel) · Story Kit filmstrip · featured stories carousel · is this you? · testimonials · how we film · closing.
 * Every line comes from the Home page in Sanity, with fallbacks in getHome() and src/lib/offers.ts (COPY.home, COPY.filmstrip).
 * Not shown since the wireframe (fields kept in Sanity): what we believe and the North-Wright proof numbers.
 */
export default async function HomePage() {
  const [h, s, offers, strip, crew] = await Promise.all([getHome(), getSettings(), getOffers(), getFilmstrip(), getCrew()])
  const poster = h.heroPoster?.asset ? urlFor(h.heroPoster).width(2400).height(1350).fit('crop').url() : null
  const hookPoster = h.hookVideo ? (h.hookPoster?.asset ? urlFor(h.hookPoster).width(1600).height(900).fit('crop').url() : await vimeoPoster(h.hookVideo, 1600)) : null

  return (
    <>
      {/* 1 · Logo splash: full-bleed, just the name, then a cue down to the film (follows the theme) */}
      <section className="splash" aria-label="Breaking Ice Productions">
        {/* Theme-aware lockup: navy ink on the light page, the on-dark version in dark mode. */}
        <Lockup variant="vertical" height={300} className="splash-logo" />
        <p className="splash-line">{h.heroEyebrow}</p>
        <a href="#film" className="scroll-cue splash-cue">{h.splashCue} <span aria-hidden="true">↓</span></a>
      </section>

      {/* 2 · Headline above the reel, buttons under it */}
      <section id="film" className="home-hero" aria-label="Introduction">
        <div className="wrap">
          <div className="home-hero-head">
            <SplitHeading as="h1" className="display-xl home-hero-title" text={h.heroTitle} />
            <p className="hero-sub">{h.heroHeadline}</p>
          </div>
          <div className="hero-frame">
            <VideoLoop url={h.heroReel} posterUrl={poster} posterAlt={h.heroPoster?.alt} label="" className="ratio-169" onDark priority sizes="(max-width: 1400px) 100vw, 1320px" />
          </div>
          <div className="btn-row home-hero-btns">
            <Btn href="/contact">{s.primaryCta}</Btn>
            <Btn href="/stories" variant="secondary">{s.secondaryCta}</Btn>
            <PlayerButton url={h.fullReel} trackAs="Showreel">
              <PlayRing />
              {h.reelButton}
            </PlayerButton>
          </div>
        </div>
      </section>

      {/* 2b · Client logos: one quiet row under the reel */}
      <LogoStrip logos={h.logos} eyebrow={h.logoStripEyebrow} title={h.logoStripTitle} />

      {/* 3 · The problem (with the optional hook video beside it) */}
      <section className="section ruled" aria-labelledby="problem-title">
        <div className={`wrap ${h.hookVideo ? 'grid-2 home-problem' : 'split'}`} style={{ alignItems: 'center' }}>
          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            <Eyebrow>{h.problemEyebrow}</Eyebrow>
            <h2 id="problem-title" className="h2">{h.problemTitle}</h2>
            {h.hookVideo && <p className="intro-copy">{h.problemBody}</p>}
          </div>
          {h.hookVideo ? (
            <div className="stack" style={{ gap: 'var(--space-4)' }}>
              <VideoLoop url={h.hookVideo} posterUrl={hookPoster} posterAlt={h.hookPoster?.alt} label="Short film" className="ratio-169" />
              <PlayerButton url={h.hookVideo} trackAs="Home hook">
                <PlayRing />
                Watch with sound
              </PlayerButton>
            </div>
          ) : (
            <p className="intro-copy">{h.problemBody}</p>
          )}
        </div>
      </section>

      {/* 4 · The ladder: three offers, each linking to its page */}
      <section className="section ruled" aria-labelledby="ladder-title">
        <div className="wrap">
          <div className="sec-head-row">
            <div className="sec-head">
              <Eyebrow>{h.ladderEyebrow}</Eyebrow>
              <h2 id="ladder-title" className="h2">{h.ladderTitle}</h2>
              <p className="body-lg muted lede">{h.ladderIntro}</p>
            </div>
            <ArrowLink href="/services">All services</ArrowLink>
          </div>
          <OfferLadder offers={offers} />
        </div>
      </section>

      {/* 5 · Story Kit filmstrip: one shoot, the whole kit */}
      <Filmstrip data={strip} />

      {/* 6 · Featured stories, one at a time (the projects marked "featured on home") */}
      <FeaturedStories stories={h.projects} eyebrow={h.storiesEyebrow} title={h.storiesTitle} line={h.storiesLine} jobLabel={h.storiesJobLabel} />

      {/* 7 · Is this you? */}
      <FitSection eyebrow={h.fitEyebrow} title={h.fitTitle} helper={h.fitHelper} items={h.fitItems} closing={h.fitClosing} cta={s.primaryCta} />

      {/* 8 · Testimonials */}
      <section className="section" aria-labelledby="t-title">
        <div className="wrap">
          <Testimonials items={h.testimonials} eyebrow={h.testimonialsEyebrow} title={h.testimonialsTitle} />
        </div>
      </section>

      {/* 9 · On site: full production, light footprint */}
      <CrewSection {...crew} />

      {/* 10 · Closing */}
      <ClosingBand s={s} line={h.closingLine} />
    </>
  )
}
