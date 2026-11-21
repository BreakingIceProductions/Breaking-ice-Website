import Image from 'next/image'
import { Eyebrow, Still } from '@/components/brand'
import { FitChecklist, StoryCarousel, type CarouselStory } from '@/components/home-client'
import { COPY } from '@/lib/offers'
import { CATEGORY_LABELS } from '@/lib/video'
import type { FeaturedStory, Filmstrip as FilmstripData, Img } from '@/lib/types'
import { urlFor } from '@/sanity/client'

/**
 * Story Kit filmstrip (Home and the Story Kit page): a navy band with a strip of film running across it.
 * A lead frame (“One shoot”), then one frame per piece of the kit, each a real still, a number, a title and a line.
 * Phones: the strip scrolls sideways and snaps to each frame.
 */
export function Filmstrip({ data, id = 'filmstrip-title' }: { data: FilmstripData; id?: string }) {
  return (
    <section className="filmstrip-band dark" aria-labelledby={id}>
      <div className="wrap">
        <div className="sec-head">
          <h2 id={id} className="h2">{data.title}</h2>
          <p className="body-lg muted lede">{data.intro}</p>
        </div>
      </div>
      <div className="fs-scroller" tabIndex={0} role="region" aria-label={data.title}>
        <ol className="fs-strip">
          <li className="fs-frame fs-lead">
            <span className="fs-lead-text">{data.lead}</span>
            <span className="fs-lead-arrow" aria-hidden="true">→</span>
          </li>
          {data.frames.map((f, i) => (
            <li key={f._key} className="fs-frame">
              <div className="fs-pic">
                {f.image?.asset ? (
                  <Image src={urlFor(f.image).width(640).height(480).fit('crop').url()} alt={f.image.alt ?? ''} fill sizes="(max-width: 820px) 70vw, 220px" style={{ objectFit: 'cover' }} />
                ) : (
                  <div className="media-pattern" aria-hidden="true" />
                )}
              </div>
              <span className="fs-num">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="fs-title">{f.title}</h3>
              {f.line && <p className="fs-line">{f.line}</p>}
            </li>
          ))}
        </ol>
      </div>
      {data.note && (
        <div className="wrap">
          <p className="fs-note">{data.note}</p>
        </div>
      )}
    </section>
  )
}

/** The first sentence of a summary, cut short at a colon or a comma so it reads as one line. Fallback for “The job”. */
function shortLine(summary?: string): string | undefined {
  if (!summary) return undefined
  let t = summary.split(/(?<=\.)\s/)[0].replace(/\.$/, '')
  const colon = t.indexOf(':')
  if (colon > 20) t = t.slice(0, colon)
  if (t.length > 120) {
    const comma = t.lastIndexOf(',', 120)
    t = comma > 40 ? t.slice(0, comma) : `${t.slice(0, t.lastIndexOf(' ', 117))}…`
  }
  return t.endsWith('…') ? t : `${t}.`
}

/** Featured stories carousel: one story at a time. Server part: builds the poster URLs and lines, the client part runs it. */
export function FeaturedStories({ stories, eyebrow, title, line, jobLabel }: { stories: FeaturedStory[]; eyebrow: string; title: string; line: string; jobLabel: string }) {
  const items: CarouselStory[] = stories.map((p) => {
    const img: Img | undefined = p.thumbnail?.asset ? p.thumbnail : p.still
    return {
      id: p._id,
      slug: p.slug,
      title: p.title,
      client: p.client,
      job: p.jobLine || COPY.home.storyJobs[p.slug] || shortLine(p.summary),
      meta: [p.location, p.year, p.category && (CATEGORY_LABELS[p.category] ?? p.category)].filter(Boolean).join(' · '),
      poster: img?.asset ? urlFor(img).width(1600).height(900).fit('crop').url() : null,
      posterAlt: img?.alt ?? '',
      video: p.heroVideo || p.cardVideo,
    }
  })
  return (
    <section className="section fc-section" aria-labelledby="stories-title">
      <div className="wrap">
        <div className="sec-head">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id="stories-title" className="h2">
            {title}
            <span className="fc-title-line">{line}</span>
          </h2>
        </div>
        <StoryCarousel stories={items} jobLabel={jobLabel} />
      </div>
    </section>
  )
}

/** “Is this you?” A navy band with a white card of ticks. */
export function FitSection({ eyebrow, title, helper, items, closing, cta }: { eyebrow: string; title: string; helper: string; items: { line: string; subline?: string }[]; closing: string; cta: string }) {
  return (
    <section className="section fit-band dark" aria-labelledby="fit-title">
      <div className="wrap fit-grid">
        <div className="sec-head">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id="fit-title" className="h2">{title}</h2>
          <p className="body-lg muted" style={{ margin: 0 }}>{helper}</p>
        </div>
        <FitChecklist items={items} closing={closing} cta={cta} />
      </div>
    </section>
  )
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

/** Client logos (Sanity: Client logo documents shown in the strip): one quiet row that drifts sideways; static and wrapped for reduced motion. */
export function LogoStrip({ logos, eyebrow, title }: { logos: { _id: string; name: string; logo?: Img; ar?: number }[]; eyebrow: string; title: string }) {
  if (!logos.length) return null
  return (
    <section className="home-logos" aria-labelledby="logos-title">
      <div className="wrap">
        <h2 id="logos-title" className="sr-only">{title}</h2>
        <div className="divider" style={{ marginBottom: 'var(--space-8)' }}>
          <span className="label">{eyebrow}</span>
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
                  l.name
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** On site: full production, light footprint. Home and About. */
export function CrewSection({ eyebrow, title, body, whoWeAre, image }: { eyebrow: string; title: string; body: string; whoWeAre?: string; image: Img }) {
  return (
    <section className="section ruled" aria-labelledby="crew-title">
      <div className="wrap grid-2 crew-grid">
        <Still image={image} label="Our crew on location" ratio="ratio-43" width={1200} />
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id="crew-title" className="h2">{title}</h2>
          <p className="intro-copy" style={{ margin: 0 }}>{body}</p>
          {whoWeAre && <p className="who-we-are">{whoWeAre}</p>}
        </div>
      </div>
    </section>
  )
}
