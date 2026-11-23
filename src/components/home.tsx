import Image from 'next/image'
import { Eyebrow, Still } from '@/components/brand'
import { FitChecklist, StoryCarousel, type CarouselStory } from '@/components/home-client'
import { COPY, FILMSTRIP_MOCK } from '@/lib/offers'
import { CATEGORY_LABELS } from '@/lib/video'
import type { FeaturedStory, Filmstrip as FilmstripData, FilmstripKind, Img } from '@/lib/types'
import { urlFor } from '@/sanity/client'

/**
 * Story Kit segments (Home and the Story Kit page): a row of seven cards on the navy brand band.
 * A lead frame (“One shoot”), then one frame per piece of the kit: a number, a title, a line, and the real still shown
 * as the thing it stands for (a player, stacked clips, a phone, prints, a browser, a schedule). See FrameMock.
 * Phones: the strip scrolls sideways and snaps to each frame.
 */
export function Filmstrip({ data, id = 'filmstrip-title' }: { data: FilmstripData; id?: string }) {
  return (
    <section className="filmstrip-band" aria-labelledby={id}>
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
            {data.frames.map((f, i) => {
              const n = String(i + 1).padStart(2, '0')
              return (
                <li key={f._key} className="fs-frame">
                  <FrameMock kind={f.kind} title={f.title} image={f.image} extra={f.extra} />
                  <span className="fs-num">{n}</span>
                  <h3 className="fs-title">{f.title}</h3>
                  {f.line && <p className="fs-line">{f.line}</p>}
                </li>
              )
            })}
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

/** A still cropped to a shape, for the mockups. Decorative inside them: the frame's label carries the meaning. */
function Pic({ image, w, h, pos, sizes = '(max-width: 820px) 60vw, 180px' }: { image: Img; w: number; h: number; pos?: string; sizes?: string }) {
  if (!image?.asset) return <span className="media-pattern" />
  return <Image src={urlFor(image).width(w).height(h).fit('crop').url()} alt="" fill sizes={sizes} style={{ objectFit: 'cover', objectPosition: pos }} />
}

/**
 * The picture area of one filmstrip frame: the same fixed box for every frame, with a small CSS mockup of the real thing
 * centred in it. All chrome is decorative; the box is one image with a label (title + the still's own alt text).
 */
function FrameMock({ kind, title, image, extra }: { kind: FilmstripKind; title: string; image: Img; extra: Img }) {
  const label = [title, image?.alt].filter(Boolean).join(': ')
  const second = extra?.asset ? extra : image
  let mock: React.ReactNode
  switch (kind) {
    case 'film':
      mock = (
        <span className="mk mk-player">
          <Pic image={image} w={640} h={360} />
          <span className="mk-play"><svg viewBox="0 0 24 24"><path d="M8 5l12 7-12 7z" fill="currentColor" /></svg></span>
          <span className="mk-bar">
            <span className="mk-track"><span className="mk-played" /></span>
            <span className="mk-time">{FILMSTRIP_MOCK.timecode}</span>
          </span>
        </span>
      )
      break
    case 'cuts':
      mock = (
        <span className="mk mk-cuts">
          {FILMSTRIP_MOCK.cutLengths.map((len, k) => (
            <span key={len} className={`mk-cut mk-cut-${k + 1}`}>
              <Pic image={k === 1 ? second : image} w={480} h={270} pos={k === 0 ? '30% 50%' : undefined} />
              <span className="mk-dur">{len}</span>
            </span>
          ))}
        </span>
      )
      break
    case 'social':
      mock = (
        <span className="mk mk-phone">
          <span className="mk-screen">
            <Pic image={image} w={270} h={480} />
            <span className="mk-ticks"><span className="on" /><span className="on" /><span /></span>
          </span>
          <span className="mk-pill" />
        </span>
      )
      break
    case 'photos':
      mock = (
        <span className="mk mk-prints">
          <span className="mk-print mk-print-1"><span className="mk-print-pic"><Pic image={second} w={360} h={360} /></span></span>
          <span className="mk-print mk-print-2"><span className="mk-print-pic"><Pic image={image} w={360} h={360} /></span></span>
        </span>
      )
      break
    case 'web':
      mock = (
        <span className="mk mk-browser">
          <span className="mk-chrome">
            <span className="mk-dots"><span /><span /><span /></span>
            <span className="mk-url">{FILMSTRIP_MOCK.url}</span>
          </span>
          <span className="mk-page">
            <Pic image={image} w={640} h={400} />
            <span className="mk-headline"><span /><span /></span>
          </span>
        </span>
      )
      break
    default:
      mock = (
        <span className="mk mk-plan">
          {FILMSTRIP_MOCK.plan.map((r) => (
            <span key={r.when} className="mk-row">
              <span className="mk-what"><b>{r.piece}</b> · {r.where}</span>
              <span className="mk-week">{r.when}</span>
            </span>
          ))}
        </span>
      )
  }
  return (
    <div className={`fs-pic fs-pic-${kind}`} role="img" aria-label={label}>
      <span aria-hidden="true" className="fs-mock">{mock}</span>
    </div>
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
    <section className="section fit-band" aria-labelledby="fit-title">
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
