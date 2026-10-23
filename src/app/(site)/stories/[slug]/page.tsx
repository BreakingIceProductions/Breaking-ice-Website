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

  // Old-layout case studies still read: the challenge becomes the brief, people and what mattered become on the ground.
  const brief = cs.brief?.length ? cs.brief : cs.challenge
  const onTheGround = cs.onTheGround?.length ? cs.onTheGround : [...(cs.people ?? []), ...(cs.whatMattered ?? [])]
  const whatItDid = cs.whatItDid?.length ? cs.whatItDid : null
  const oldResults = !whatItDid && cs.results?.length ? (cs.results as { _key?: string; headline?: string; detail?: string }[]) : []
  const shots = (cs.gallery ?? []).filter((g: Img) => g?.asset)
  const lead: Img | undefined = cs.peopleImage?.asset ? cs.peopleImage : shots[0]
  const moreShots: Img[] = cs.peopleImage?.asset ? shots : shots.slice(1)
  const facts: { _key?: string; label?: string; value?: string }[] = (cs.facts ?? []).filter((f: { value?: string }) => f?.value)
  const bts: { title?: string; body?: string } | undefined = cs.behindTheScenes?.body ? cs.behindTheScenes : undefined

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
              <VideoLoop url={p.heroVideo} posterUrl={poster ?? heroImg} posterAlt={p.thumbnail?.alt ?? ""} label="The film" className="ratio-169" onDark priority />
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

      {/* One article, with the facts beside it */}
      <section className="story-body" aria-label="The story">
        <div className="wrap story-grid">
          <article className="story-article">
            {full && isPhoto && <Stills images={gallery} variant="photo" />}

            {full && (
              <>
                <div className="story-part">
                  <h2 className="story-h">The brief</h2>
                  <RichText value={brief} fallback="[Who the client is, what they needed and why.]" />
                </div>

                {lead && !isPhoto && <SingleStill image={lead} label="Still from the film" ratio="ratio-169" width={1400} />}

                <div className="story-part">
                  <h2 className="story-h">On the ground</h2>
                  <RichText value={onTheGround.length ? onTheGround : null} fallback="[How it was made: the shoot, the people, what was hard.]" />
                </div>

                {bts && (
                  <aside className="story-callout" aria-label="Behind the scenes">
                    <span className="label">Behind the scenes</span>
                    {bts.title && <p className="story-callout-title">{bts.title}</p>}
                    <p>{bts.body}</p>
                  </aside>
                )}

                {cs.pullQuote && (
                  <figure className="pull story-pull">
                    <Mark size={40} right="var(--ink)" />
                    <blockquote>{cs.pullQuote.quote}</blockquote>
                    {/* Never a person's name on the site: role and organization only. */}
                    <figcaption className="stack" style={{ gap: 2 }}>
                      <span className="eyebrow">{cs.pullQuote.role ?? cs.pullQuote.organization}</span>
                      {cs.pullQuote.role && cs.pullQuote.organization && <span className="muted">{cs.pullQuote.organization}</span>}
                    </figcaption>
                  </figure>
                )}

                {(whatItDid || oldResults.length > 0 || cs.resultsIntro || p.sample) && (
                  <div className="story-part">
                    <h2 className="story-h">What it did</h2>
                    {whatItDid ? (
                      <RichText value={whatItDid} />
                    ) : (
                      <>
                        <RichText value={null} fallback={cs.resultsIntro ?? '[How the film was used and how people reacted.]'} />
                        {oldResults.length > 0 && (
                          <ul className="story-results">
                            {oldResults.map((r, i) => (
                              <li key={r._key ?? i}><strong>{r.headline}</strong> {r.detail}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                )}

                {!isPhoto && moreShots.length > 0 && (
                  <div className="story-part">
                    <h2 className="story-h">Stills</h2>
                    <Stills images={moreShots} variant="film" />
                  </div>
                )}
              </>
            )}

            {!isPhoto && (hasTranscript || captionsUrl) && (
              <div className="story-part">
                <details className="transcript">
                  <summary>Read the transcript</summary>
                  <div style={{ marginTop: 16 }}>
                    <RichText value={p.transcript} />
                  </div>
                </details>
                {captionsUrl && (
                  <a className="captions-download text-link" href={`${captionsUrl}?dl=`} download>
                    Download captions (.vtt)
                  </a>
                )}
              </div>
            )}
          </article>

          <aside className="story-facts" aria-label="Project facts">
            <dl>
              {(p.client || p.sample) && <div><dt>Client</dt><dd>{p.client ?? '[Client]'}</dd></div>}
              {(p.location || p.sample) && <div><dt>Place</dt><dd>{p.location ?? '[Place]'}</dd></div>}
              {(p.year || p.sample) && <div><dt>Year</dt><dd>{p.year ?? '[Year]'}</dd></div>}
              {facts.map((f, i) => (
                <div key={f._key ?? i}><dt>{f.label}</dt><dd>{f.value}</dd></div>
              ))}
              {p.services?.length > 0 && (
                <div>
                  <dt>Services</dt>
                  <dd>
                    {p.services.map((sv: { slug: string; title: string }, i: number) => (
                      <span key={sv.slug}>{i > 0 && ' · '}<Link className="text-link" href={`/services/${sv.slug}`}>{sv.title}</Link></span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
            <Btn href="/contact">{s.primaryCta}</Btn>
          </aside>
        </div>
      </section>

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
