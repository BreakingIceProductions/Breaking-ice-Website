import Link from 'next/link'
import { Btn, Eyebrow, Still } from '@/components/brand'
import { ClosingBand, Process, RichText } from '@/components/sections'
import { VideoLoop } from '@/components/video'
import { getAbout, getSettings, pick } from '@/lib/data'
import { seoMeta } from '@/lib/seo'
import { vimeoPoster } from '@/lib/vimeo'

export async function generateMetadata() {
  const a = await getAbout()
  return seoMeta(a.seo, 'About', 'Founded in Norman Wells, NWT in 2022 and now also based in Stony Plain, Alberta. Meet Josh Ferguson and the patient, people-first way we make films.', { path: '/about', eyebrow: 'About' })
}

export default async function AboutPage() {
  const [a, s] = await Promise.all([getAbout(), getSettings()])
  const heroPoster = await vimeoPoster(a.heroVideo, 1600)
  const milestones: { _key?: string; year: string; text: string }[] = pick(a.milestones, [1, 2, 3, 4].map((n) => ({ year: '[Year]', text: `[Milestone ${n}]` })))
  const beliefs: { _key?: string; title: string; body: string }[] = pick(a.beliefs, [1, 2, 3].map((n) => ({ title: `[Belief ${n}]`, body: '[Two or three sentences.]' })))
  const founder = a.founder ?? {}

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <Eyebrow>{pick(a.heroEyebrow, 'About')}</Eyebrow>
          <h1 className="display-xl">{pick(a.heroHeadline, 'From the North to Alberta')}</h1>
          <p className="body-lg muted" style={{ margin: 0, maxWidth: '56ch' }}>
            {pick(a.heroIntro, 'Breaking Ice Productions tells the human stories inside organizations, working from Stony Plain, Alberta and Norman Wells, NWT.')}
          </p>
        </div>
      </section>
      <section style={{ paddingBottom: 'var(--section)' }}>
        <div className="wrap">
          <VideoLoop url={a.heroVideo} posterUrl={heroPoster} label="About film" className="ratio-169 cut-lg" priority />
        </div>
      </section>

      <section className="section ruled" aria-labelledby="story">
        <div className="wrap split">
          <div className="stack" style={{ gap: 12 }}>
            <Eyebrow>{pick(a.storyEyebrow, 'Our story')}</Eyebrow>
            <h2 id="story" className="h2">{pick(a.storyTitle, 'Why we stay')}</h2>
          </div>
          <div className="body-lg">
            <RichText value={a.storyBody} fallback={['[The story of the company: how it started, who it serves, what it has learned. Three or four short paragraphs, in your words.]']} />
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="journey">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>{pick(a.journeyEyebrow, 'From the North to Alberta')}</Eyebrow>
            <h2 id="journey" className="h2">{pick(a.journeyTitle, 'Two places, one way of working')}</h2>
          </div>
          <div className="grid-2">
            <Link href="/northwest-territories" className="loc-card">
              <Still image={a.journeyNorthImage} label="Norman Wells" ratio="ratio-169" width={1000} />
              <span className="eyebrow">{pick(a.journeyNorthText, 'Where it began')}</span>
              <span className="h2">Norman Wells · the Sahtú</span>
            </Link>
            <Link href="/alberta" className="loc-card">
              <Still image={a.journeyAlbertaImage} label="Stony Plain" ratio="ratio-169" width={1000} />
              <span className="eyebrow">{pick(a.journeyAlbertaText, 'Where we are now')}</span>
              <span className="h2">Stony Plain · Edmonton region</span>
            </Link>
          </div>
          <ol className="grid-4" style={{ listStyle: 'none', padding: 0, margin: 'var(--space-12) 0 0' }}>
            {milestones.map((m, i) => (
              <li key={m._key ?? i} style={{ borderTop: '2px solid var(--ink)', paddingTop: 16 }}>
                <div className="step-num">{m.year}</div>
                <div className={m.text.startsWith('[') ? 'placeholder-text' : undefined}>{m.text}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="how">
        <div className="wrap">
          <div className="sec-head-row">
            <div className="sec-head">
              <Eyebrow>{pick(a.processEyebrow, 'How we work')}</Eyebrow>
              <h2 id="how" className="h2">{pick(a.processTitle, 'Listen first')}</h2>
            </div>
            <Link className="link-arrow" href="/services">Our services <span aria-hidden="true">→</span></Link>
          </div>
          <Process steps={s.processSteps} compact />
        </div>
      </section>

      <section className="section ruled" aria-labelledby="founder">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <Still image={founder.portrait} label="Portrait" ratio="ratio-45" cut={false} width={900} />
          <div className="stack" style={{ gap: 16 }}>
            <Eyebrow>{pick(a.founderEyebrow, 'Founder')}</Eyebrow>
            <h2 id="founder" className="h1">{founder.name ?? 'Josh Ferguson'}</h2>
            <span className="caption">{founder.role ?? 'Owner & creative director'}</span>
            <RichText value={founder.bio} fallback={['[Founder bio: background, the North, why this work. Three short paragraphs.]']} />
            <Still image={founder.onLocationPhoto} label="On location" ratio="ratio-169" />
            <div><Btn href="/contact">{s.primaryCta}</Btn></div>
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="believe">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>{pick(a.beliefsEyebrow, 'What we believe')}</Eyebrow>
            <h2 id="believe" className="quote" style={{ fontSize: 'clamp(30px, 3.4vw, 44px)', lineHeight: 1.2, margin: 0 }}>{pick(a.beliefsTitle, s.tagline)}</h2>
          </div>
          <div className="grid-3">
            {beliefs.map((b, i) => (
              <div key={b._key ?? i} className="panel cut-lg stack" style={{ gap: 12 }}>
                <span className="step-num">0{i + 1}</span>
                <h3 className={`h3 ${b.title.startsWith('[') ? 'placeholder-text' : ''}`}>{b.title}</h3>
                <p className={`muted ${b.body.startsWith('[') ? 'placeholder-text' : ''}`} style={{ margin: 0 }}>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ClosingBand s={s} />
    </>
  )
}
