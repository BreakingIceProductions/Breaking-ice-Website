import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Btn, Eyebrow, Mark, Still, ArrowLink } from '@/components/brand'
import { StoryCard } from '@/components/cards'
import { ClosingBand, RichText } from '@/components/sections'
import { SingleStill, Stills } from '@/components/stills'
import { PlayerButton, VideoLoop } from '@/components/video'
import { getNextProject, getProjectBySlug, getProjects, getSettings } from '@/lib/data'
import { seoMeta } from '@/lib/seo'
import { JsonLd, ORG_ID, breadcrumbLd } from '@/components/json-ld'
import { SITE_URL } from '@/lib/site'
import { CATEGORY_LABELS, embedUrl } from '@/lib/video'
import { urlFor } from '@/sanity/client'
import type { Img } from '@/lib/types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const projects = await getProjects()
  return projects.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const p = await getProjectBySlug(slug)
  if (!p) return {}
  return seoMeta(p.caseStudy?.seo ?? p.seo, p.title, p.caseStudy?.summary, {
    path: `/stories/${p.slug}`,
    eyebrow: ['Story', p.category && CATEGORY_LABELS[p.category]].filter(Boolean).join(' · '),
    image: p.thumbnail,
  })
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params
  const [p, s] = await Promise.all([getProjectBySlug(slug), getSettings()])
  if (!p) notFound()
  const cs = p.caseStudy ?? {}
  const next = cs.nextProject ?? (await getNextProject(slug))
  const isPhoto = p.storyType === 'photo'
  // Real projects without a case study get the short version (hero, title, summary, meta).
  // Samples keep every section, with placeholders, so the layout can be judged.
  const full = Boolean(p.caseStudy) || Boolean(p.sample)
  const summary: string | undefined = cs.summary ?? p.seo?.description
  const captionsUrl: string | undefined = p.captionsUrl ?? undefined
  const hasTranscript = Array.isArray(p.transcript) && p.transcript.length > 0
  const poster = p.thumbnail?.asset ? urlFor(p.thumbnail).width(2000).height(1125).fit('crop').url() : null
  const heroImg = p.heroImage?.asset ? urlFor(p.heroImage).width(2000).height(1125).fit('crop').url() : null
  const gallery: Img[] = cs.gallery?.length ? cs.gallery : Array.from({ length: isPhoto ? 4 : 5 }, () => null)
  const results: { _key?: string; headline?: string; detail?: string }[] = cs.results?.length
    ? cs.results
    : [1, 2, 3].map((n) => ({ headline: `[Result ${n}]`, detail: '[What changed, in one sentence]' }))

  // Video details for Google (needs a real film, a poster and a year).
  const playUrl = embedUrl(p.heroVideo, 'play', { captions: Boolean(captionsUrl) })
  const transcriptText = Array.isArray(p.transcript)
    ? (p.transcript as { children?: { text?: string }[] }[]).map((b) => (b.children ?? []).map((c) => c.text ?? '').join('')).join('\n').slice(0, 20000)
    : undefined
  const videoLd = !isPhoto && playUrl && poster && p.year
    ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: p.title,
        description: summary ?? p.title,
        thumbnailUrl: [poster],
        uploadDate: `${p.year}-01-01`,
        embedUrl: playUrl,
        url: `${SITE_URL}/stories/${p.slug}`,
        publisher: { '@id': ORG_ID },
        transcript: transcriptText || undefined,
      }
    : null

  const stillsSection = (
    <section className="section ruled" aria-labelledby="stills">
      <div className="wrap">
        <h2 id="stills" className="eyebrow" style={{ margin: '0 0 var(--space-8)' }}>Stills</h2>
        <Stills images={gallery} variant={isPhoto ? 'photo' : 'film'} />
      </div>
    </section>
  )

  return (
    <>
      <JsonLd data={[breadcrumbLd([['Stories', '/stories'], [p.title, `/stories/${p.slug}`]]), ...(videoLd ? [videoLd] : [])]} />
      {/* Hero film */}
      <section className="dark film-section" aria-label="Film">
        <div className="wrap">
          {isPhoto ? (
            <Still image={p.heroImage} label="Hero photograph" ratio="ratio-169" width={2000} onDark priority sizes="100vw" />
          ) : (
            <div style={{ position: 'relative' }}>
              <VideoLoop url={p.heroVideo} posterUrl={poster ?? heroImg} label="The film" className="ratio-169" onDark priority />
            </div>
          )}
        </div>
      </section>

      <section className="page-head after-film">
        <div className="wrap">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/stories">← All stories</Link>
          </nav>
          {p.sample && <p className="sample-flag" style={{ margin: '0 0 8px' }}>Sample project · replace in the Studio</p>}
          <Eyebrow>{CATEGORY_LABELS[p.category ?? ''] ?? 'Story'}</Eyebrow>
          <h1 className="h1">{p.title}</h1>
          {(summary || p.sample) && (
            <p className="body-lg muted lede" style={{ marginBottom: 'var(--space-8)' }}>
              {summary ?? '[Summary: what this story is, in one or two sentences.]'}
            </p>
          )}
          {!isPhoto && (
            <PlayerButton url={p.heroVideo} className="btn btn-secondary" trackAs={`Story: ${p.title}`} captions={Boolean(captionsUrl)}>
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

      {full && isPhoto && stillsSection}

      {full && (
        <>
          <section className="section ruled" aria-labelledby="challenge">
            <div className="wrap split">
              <h2 id="challenge" className="eyebrow">The challenge</h2>
              <div className="body-lg"><RichText value={cs.challenge} fallback="[What the organization needed, and what made it hard.]" /></div>
            </div>
          </section>

          <section className="section ruled" aria-labelledby="people">
            <div className="wrap grid-2" style={{ alignItems: 'center' }}>
              <SingleStill image={cs.peopleImage} label="The people" ratio="ratio-45" width={900} />
              <div className="stack" style={{ gap: 16 }}>
                <h2 id="people" className="eyebrow">The people</h2>
                <p className="h2" style={{ margin: 0 }}>{cs.peopleHeadline ?? '[Whose story this is]'}</p>
                <RichText value={cs.people} fallback="[Who we met, and how trust was built.]" />
              </div>
            </div>
          </section>

          <section className="section ruled" aria-labelledby="mattered">
            <div className="wrap split">
              <h2 id="mattered" className="eyebrow">What mattered</h2>
              <div className="body-lg"><RichText value={cs.whatMattered} fallback="[The moments and truths the film was built around.]" /></div>
            </div>
          </section>
        </>
      )}

      {!isPhoto && (full || hasTranscript || captionsUrl) && (
        <section className="section" aria-labelledby="transcript-h">
          <div className="wrap split">
            <h2 id="transcript-h" className="eyebrow">Transcript</h2>
            <div>
              <details className="transcript">
                <summary>Read the transcript</summary>
                <div style={{ marginTop: 16 }}>
                  <RichText value={p.transcript} fallback="[Speaker]: [Transcript text. Added in the Studio, readable by Google.]" />
                </div>
              </details>
              {captionsUrl && (
                <a className="captions-download text-link" href={`${captionsUrl}?dl=`} download>
                  Download captions (.vtt)
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {full && (
        <>
          {!isPhoto && stillsSection}

          <section className="section ruled" aria-label="Quote">
            <div className="wrap">
              <figure className="pull" style={{ margin: 0 }}>
                <Mark size={56} right="var(--ink)" />
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
                <h2 id="results" className="eyebrow">Results</h2>
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
        </>
      )}

      {next && (
        <section className="section ruled" aria-labelledby="next">
          <div className="wrap">
            <div className="sec-head-row">
              <h2 id="next" className="eyebrow">Next story</h2>
              <ArrowLink href="/stories">All stories</ArrowLink>
            </div>
            <div style={{ maxWidth: 640 }}><StoryCard p={next} /></div>
          </div>
        </section>
      )}

      <ClosingBand s={s} />
    </>
  )
}
