import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Btn, Eyebrow, Mark, Still } from '@/components/brand'
import { StoryCard } from '@/components/cards'
import { ClosingBand, RichText } from '@/components/sections'
import { PlayerButton, VideoLoop } from '@/components/video'
import { getNextProject, getProjectBySlug, getProjects, getSettings } from '@/lib/data'
import { seoMeta } from '@/lib/seo'
import { CATEGORY_LABELS } from '@/lib/video'
import { urlFor } from '@/sanity/client'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const projects = await getProjects()
  return projects.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const p = await getProjectBySlug(slug)
  if (!p) return {}
  return seoMeta(p.caseStudy?.seo ?? p.seo, p.title, p.caseStudy?.summary)
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params
  const [p, s] = await Promise.all([getProjectBySlug(slug), getSettings()])
  if (!p) notFound()
  const cs = p.caseStudy ?? {}
  const next = cs.nextProject ?? (await getNextProject(slug))
  const isPhoto = p.storyType === 'photo'
  const poster = p.thumbnail?.asset ? urlFor(p.thumbnail).width(2000).height(1125).fit('crop').url() : null
  const heroImg = p.heroImage?.asset ? urlFor(p.heroImage).width(2000).height(1125).fit('crop').url() : null
  const gallery: unknown[] = cs.gallery?.length ? cs.gallery : Array.from({ length: 5 }, () => null)
  const results: { _key?: string; headline?: string; detail?: string }[] = cs.results?.length
    ? cs.results
    : [1, 2, 3].map((n) => ({ headline: `[Result ${n}]`, detail: '[What changed, in one sentence]' }))

  return (
    <>
      {/* Hero film */}
      <section className="dark" aria-label="Film">
        {isPhoto ? (
          <Still image={p.heroImage} label="Hero photograph" ratio="ratio-169" cut={false} width={2000} onDark priority sizes="100vw" />
        ) : (
          <div style={{ position: 'relative' }}>
            <VideoLoop url={p.heroVideo} posterUrl={poster ?? heroImg} label="The film" className="ratio-169" onDark priority />
          </div>
        )}
      </section>

      <section className="page-head" style={{ paddingTop: 'var(--space-16)' }}>
        <div className="wrap">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/stories">← All stories</Link>
          </nav>
          {p.sample && <p className="sample-flag" style={{ margin: '0 0 8px' }}>Sample project · replace in the Studio</p>}
          <Eyebrow>{CATEGORY_LABELS[p.category ?? ''] ?? 'Story'}</Eyebrow>
          <h1 className="h1">{p.title}</h1>
          <p className="body-lg muted" style={{ margin: '0 0 var(--space-8)', maxWidth: '58ch' }}>
            {cs.summary ?? '[Summary: what this story is, in one or two sentences.]'}
          </p>
          {!isPhoto && (
            <PlayerButton url={p.heroVideo} className="btn btn-secondary">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5l12 7-12 7z" fill="currentColor" /></svg>
              Watch the film
            </PlayerButton>
          )}
        </div>
      </section>

      <section style={{ paddingBottom: 'var(--space-16)' }}>
        <div className="wrap">
          <dl className="meta-row">
            <div><dt>Client</dt><dd>{p.client ?? '[Client]'}</dd></div>
            <div><dt>Place</dt><dd>{p.location ?? '[Place]'}</dd></div>
            <div>
              <dt>Services</dt>
              <dd>
                {p.services?.length
                  ? p.services.map((sv: { slug: string; title: string }, i: number) => (
                      <span key={sv.slug}>{i > 0 && ' · '}<Link className="text-link" href={`/services/${sv.slug}`}>{sv.title}</Link></span>
                    ))
                  : '[Services]'}
              </dd>
            </div>
            <div><dt>Year</dt><dd>{p.year ?? '[Year]'}</dd></div>
          </dl>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="challenge">
        <div className="wrap split">
          <h2 id="challenge" className="eyebrow" style={{ margin: 0 }}>The challenge</h2>
          <div className="body-lg"><RichText value={cs.challenge} fallback="[What the organization needed, and what made it hard.]" /></div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="people">
        <div className="wrap grid-2" style={{ alignItems: 'center' }}>
          <Still image={cs.peopleImage} label="The people" ratio="ratio-45" width={900} />
          <div className="stack" style={{ gap: 16 }}>
            <h2 id="people" className="eyebrow" style={{ margin: 0 }}>The people</h2>
            <p className="h2" style={{ margin: 0 }}>{cs.peopleHeadline ?? '[Whose story this is]'}</p>
            <RichText value={cs.people} fallback="[Who we met, and how trust was built.]" />
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="mattered">
        <div className="wrap split">
          <h2 id="mattered" className="eyebrow" style={{ margin: 0 }}>What mattered</h2>
          <div className="body-lg"><RichText value={cs.whatMattered} fallback="[The moments and truths the film was built around.]" /></div>
        </div>
      </section>

      {!isPhoto && (
        <section className="section" aria-labelledby="transcript-h">
          <div className="wrap split">
            <h2 id="transcript-h" className="eyebrow" style={{ margin: 0 }}>Transcript</h2>
            <details className="transcript">
              <summary>Read the transcript</summary>
              <div style={{ marginTop: 16 }}>
                <RichText value={p.transcript} fallback="[Speaker]: [Transcript text. Added in the Studio, readable by Google.]" />
              </div>
            </details>
          </div>
        </section>
      )}

      <section className="section ruled" aria-labelledby="stills">
        <div className="wrap">
          <h2 id="stills" className="eyebrow" style={{ margin: '0 0 var(--space-8)' }}>Stills</h2>
          <div className="gallery">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {gallery.map((img: any, i) => (
              <Still key={img?._key ?? i} image={img} label={`Still ${i + 1}`} ratio={i === 0 ? 'ratio-169' : 'ratio-43'} cut={i === 0} width={i === 0 ? 1400 : 800} />
            ))}
          </div>
        </div>
      </section>

      <section className="section ruled" aria-label="Quote">
        <div className="wrap">
          <figure className="pull" style={{ margin: 0 }}>
            <Mark size={56} right="var(--navy)" />
            <blockquote className={cs.pullQuote ? '' : 'placeholder-text'}>{cs.pullQuote?.quote ?? '[A true line from someone on camera, or from the client.]'}</blockquote>
            <figcaption className="stack" style={{ gap: 2 }}>
              <span className="eyebrow">{cs.pullQuote?.name ?? '[Name]'}</span>
              <span className="muted">{[cs.pullQuote?.role ?? '[Role]', cs.pullQuote?.organization ?? '[Organization]'].join(', ')}</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="results">
        <div className="wrap split">
          <div className="stack" style={{ gap: 12 }}>
            <h2 id="results" className="eyebrow" style={{ margin: 0 }}>Results</h2>
            {cs.resultsIntro && <p className="muted" style={{ margin: 0 }}>{cs.resultsIntro}</p>}
          </div>
          <div className="results">
            {results.map((r, i) => (
              <div key={r._key ?? i} className="result">
                <h3 className={`h3 ${r.headline?.startsWith('[') ? 'placeholder-text' : ''}`}>{r.headline}</h3>
                <p className={`muted ${r.detail?.startsWith('[') ? 'placeholder-text' : ''}`} style={{ margin: 0 }}>{r.detail}</p>
              </div>
            ))}
            <div style={{ marginTop: 'var(--space-8)' }}><Btn href="/contact">{s.primaryCta}</Btn></div>
          </div>
        </div>
      </section>

      {next && (
        <section className="section ruled" aria-labelledby="next">
          <div className="wrap">
            <div className="sec-head-row">
              <h2 id="next" className="eyebrow" style={{ margin: 0 }}>Next story</h2>
              <Link href="/stories" className="link-arrow">All stories <span aria-hidden="true">→</span></Link>
            </div>
            <div style={{ maxWidth: 640 }}><StoryCard p={next} /></div>
          </div>
        </section>
      )}

      <ClosingBand s={s} />
    </>
  )
}
