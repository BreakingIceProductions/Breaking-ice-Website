import Image from 'next/image'
import { ArrowLink, Btn, Eyebrow } from '@/components/brand'
import { StoryCard } from '@/components/cards'
import { Testimonials } from '@/components/interactive'
import { OfferLadder } from '@/components/offers'
import { ClosingBand } from '@/components/sections'
import { SplitHeading } from '@/components/split-heading'
import { SwipeRail } from '@/components/swipe-rail'
import { PlayerButton, VideoLoop } from '@/components/video'
import { getHome, getOffers, getSettings } from '@/lib/data'
import { COPY } from '@/lib/offers'
import { seoMeta } from '@/lib/seo'
import { vimeoPoster } from '@/lib/vimeo'
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

const PlayRing = () => (
  <span className="ring" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5l12 7-12 7z" fill="currentColor" /></svg>
  </span>
)

/**
 * Home, in order: hero reel · the problem · what we believe · the ladder · featured stories · proof · closing.
 * Every line comes from the Home page in Sanity, with fallbacks in getHome() and src/lib/offers.ts (COPY.home).
 */
export default async function HomePage() {
  const [h, s, offers] = await Promise.all([getHome(), getSettings(), getOffers()])
  const poster = h.heroPoster?.asset ? urlFor(h.heroPoster).width(2400).height(1350).fit('crop').url() : null
  const hookPoster = h.hookVideo ? (h.hookPoster?.asset ? urlFor(h.hookPoster).width(1600).height(900).fit('crop').url() : await vimeoPoster(h.hookVideo, 1600)) : null
  const logos = h.logos.length ? h.logos : Array.from({ length: 7 }, (_, i) => ({ _id: `l${i}`, name: '', logo: null, ar: undefined as number | undefined }))

  return (
    <>
      {/* 1 · Hero: the reel, full bleed, with the line over it */}
      <section className="hero-bleed dark" aria-label="Introduction">
        <div className="hero-bleed-film">
          <VideoLoop url={h.heroReel} posterUrl={poster} posterAlt={h.heroPoster?.alt} label="" onDark priority sizes="100vw" />
        </div>
        <div className="hero-bleed-scrim" aria-hidden="true" />
        <div className="wrap hero-bleed-copy">
          <p className="eyebrow">{h.heroEyebrow}</p>
          <SplitHeading as="h1" className="display-xl hero-bleed-title" text={h.heroTitle} />
          <p className="hero-sub hero-bleed-sub">{h.heroHeadline}</p>
          <div className="btn-row">
            <Btn href="/contact">{s.primaryCta}</Btn>
            <Btn href="/stories" variant="secondary">{s.secondaryCta}</Btn>
            <PlayerButton url={h.fullReel} trackAs="Showreel">
              <PlayRing />
              Watch the reel
            </PlayerButton>
          </div>
        </div>
        {!h.heroReel && !poster && <span className="hero-note">Hero reel: add a Vimeo/YouTube link and poster image in the Studio</span>}
      </section>

      {/* 2 · The problem (with the optional hook video beside it) */}
      <section className="section" aria-labelledby="problem-title">
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

      {/* 3 · What we believe, and the plain who-we-are line */}
      <section className="section ruled" aria-labelledby="belief-title">
        <div className="wrap split">
          <Eyebrow>{h.beliefEyebrow}</Eyebrow>
          <div className="stack" style={{ gap: 'var(--space-5)' }}>
            <h2 id="belief-title" className="quote quote-lg">{h.beliefTitle}</h2>
            <p className="intro-copy">{h.beliefBody}</p>
            <p className="who-we-are">{h.whoWeAre}</p>
          </div>
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

      {/* 5 · Featured stories (the projects marked "featured on home") */}
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

      {/* 6 · Proof: North-Wright numbers, client logos, testimonials */}
      <section className="section ruled" aria-labelledby="proof-title">
        <div className="wrap">
          <div className="sec-head-row">
            <div className="sec-head">
              <Eyebrow>{h.proofEyebrow}</Eyebrow>
              <h2 id="proof-title" className="h2">{h.proofTitle}</h2>
              <p className="body-lg muted lede">{h.proofBody}</p>
            </div>
            {h.proofProject ? (
              <ArrowLink href={`/stories/${h.proofProject.slug}`}>{COPY.home.proofStoryLink}</ArrowLink>
            ) : (
              <ArrowLink href="/stories">{COPY.home.proofAllLink}</ArrowLink>
            )}
          </div>
          <dl className="stats proof-stats" style={{ marginTop: 0 }}>
            {h.proofStats.map((st, i) => (
              <div className="stat" key={st._key ?? i}>
                <dt className="caption">{st.label}</dt>
                <dd className="stat-value">{st.value}</dd>
              </div>
            ))}
          </dl>

          <h3 id="logos-title" className="sr-only">{h.logoStripTitle}</h3>
          <div className="divider" style={{ margin: 'var(--space-16) 0 var(--space-8)' }}>
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
      <section className="section ruled" aria-labelledby="t-title">
        <div className="wrap">
          <Testimonials items={h.testimonials} eyebrow={h.testimonialsEyebrow} title={h.testimonialsTitle} />
        </div>
      </section>

      {/* 7 · Closing */}
      <ClosingBand s={s} line={h.closingLine} />
    </>
  )
}
