import type { Metadata } from 'next'
import { Eyebrow } from '@/components/brand'
import { embedUrl } from '@/lib/video'
import styles from './proposal.module.css'

/**
 * Online companion to Breaking Ice's proposal for University of Alberta RFP 2026-0155, Workstream A
 * (two young-worker safety videos for the Injury Prevention Centre). Unlisted: not in the sitemap or navigation,
 * and noindex/nofollow. The full proposal is submitted as a PDF; this page carries only the pertinent parts.
 * Wording comes from the proposal (261126_Proposal_Workstream_A). Client contacts and references stay in the PDF.
 */

// TODO: paste the Vimeo link for Sample 1 (Understanding the Management Plans) here. Empty shows a "link coming" state.
const SAMPLE_1_VIMEO = ''

const PDF_HREF = '/proposals/uofa-ipc-2026-0155.pdf'
const EMAIL = 'josh@breakingiceproductions.com'
const PHONE = '807-621-2780'

export const metadata: Metadata = {
  title: 'Proposal: Young Workers Safety Videos',
  description: 'Breaking Ice Productions’ response to University of Alberta RFP 2026-0155, Workstream A – Video Production.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

const SAMPLES: {
  title: string
  client: string
  url: string
  length: string
  challenge: string
  approach: string
  resultLabel: string
  result: string
}[] = [
  {
    title: 'Understanding the Management Plans',
    client: 'Imperial Oil, Norman Wells',
    url: SAMPLE_1_VIMEO,
    length: '3:58 · plan cuts 30–45 s each',
    challenge: 'Introduce six technical management plans to community members at the start of public meetings. The plans were long regulatory documents, and the audience came from many backgrounds.',
    approach: 'A plain-language script approved by the regulatory team, then a custom animated map of the site built from real elevation data, with line-art callouts and cards that name each item as it’s spoken, blended with drone footage. Delivered with captions, plus one-minute plan cuts for web and social.',
    resultLabel: 'Results',
    result: 'Imperial has kept bringing us back, for the aquatic effects monitoring video and the decommissioning series, and has asked to plan its 2027 content with us.',
  },
  {
    title: 'Northern Development Program',
    client: 'Imperial Oil, Sahtú region, 2026',
    url: 'https://vimeo.com/1237728973',
    length: '3:47',
    challenge: 'Imperial wanted more young people from Sahtú communities to apply to its Northern Development Program, a path to an education and a job in oil and gas. The film had to speak to young workers in their own terms and show what the program actually asks of them.',
    approach: 'Program participants from five Sahtú communities tell it themselves: why they joined, what they’re learning on the job, and why patience with training pays off. The message to applicants stays simple: show up every day and be willing to learn.',
    resultLabel: 'Delivered',
    result: 'The main film, plus one-minute profiles of individual participants for social media.',
  },
  {
    title: 'Innovators’ Showcase: Délı̨nę',
    client: 'Sahtú Divisional Education Council',
    url: 'https://vimeo.com/1237731219',
    length: '3:08',
    challenge: 'Capture a one-day STEM competition for students from several Sahtú schools, on the shore of Great Bear Lake, and turn it into a short film students, families and funders would actually watch and share.',
    approach: 'Full-day coverage of every challenge room, students at work rather than posed, on-screen titles for each of the five challenges, and media consent for every student handled through the school board.',
    resultLabel: 'Results',
    result: 'The council has brought us back for each showcase since 2024, in Fort Good Hope, Délı̨nę and Tulita.',
  },
]

const IDEAS = [
  {
    title: 'Animated hazard callouts',
    body: 'Plain-language line-art callouts that point to the hazard in frame and name it in a few words, the style we developed for Imperial Oil’s management plans explainer. It lets us show what could happen without staging anything dangerous.',
  },
  {
    title: 'Vertical first',
    body: 'Every scene is framed and blocked for 9:16 with a protected 16:9 frame, so the vertical version is composed, not cropped.',
  },
  {
    title: 'Real apprentices on camera',
    body: 'Casting through trade schools and unions brings credibility actors can’t, and the cast become ambassadors at launch.',
  },
  {
    title: 'Captions for sound-off viewing',
    body: 'Most social viewing starts muted. Captions sit clear of platform buttons, sized for a phone and timed to speech, with key words like “See it” carried as graphics.',
  },
]

const PHASES = [
  { n: 'Phase 1', name: 'Assessment & Planning', when: 'Dec 2026 – Mar 2027', body: 'Kickoff, resource review, the committee’s draft concept, creative brief. Direction confirmed.' },
  { n: 'Phase 2', name: 'Development & User Feedback', when: 'Apr – Aug 2027', body: 'Scripts and storyboards, safety review, casting and locations, two shoot days, edit, focus group.' },
  { n: 'Phase 3', name: 'Implementation', when: 'Sep – Dec 2027', body: 'All versions in English and French, three 15-second cut-downs, partner kit, launch support.' },
  { n: 'Phase 4', name: 'Reporting of metrics', when: 'Jan 2028', body: 'Performance report by January 31, with a short final update in April 2028.' },
]

const MILESTONES: [string, string][] = [
  ['January 2027', 'Committee meeting 1: the committee’s draft concept'],
  ['March 2027', 'Direction confirmed by the committee and IPC'],
  ['April – May 2027', 'Committee meetings 2 and 3: scripts and storyboards drafted, revised and locked'],
  ['June 2027', 'Two shoot days, Edmonton area'],
  ['July 2027', 'Committee meeting 4: final presentation of the fine cuts'],
  ['August 2027', 'Focus group, memo and edit day. Finals approved.'],
  ['September 2027', 'All versions, French captions, cut-downs and partner kit delivered for launch'],
  ['January 2028', 'Phase 4 report delivered'],
  ['To April 2028', 'On hand through campaign completion'],
]

const TEAM: [string, string, string?][] = [
  ['Project Lead / Director / Editor', 'Josh Ferguson, Breaking Ice Productions', 'Single point of contact. Leads committee sessions, writes and directs, shoots as director of photography, edits both videos.'],
  ['Second camera', 'Geet Chahil, camera operator', 'Second angle and coverage'],
  ['Sound recordist', 'Edmonton freelance sound recordist', 'Location sound'],
  ['Gaffer / grip', 'Edmonton freelance gaffer/grip', 'Lighting, rigging, safe cable and equipment management'],
  ['Production assistant', 'Thomas Paton, Breaking Ice Productions', 'Releases, talent coordination, set support'],
  ['Sound design and mix', '', 'Sound effects, music edit, final mix'],
  ['Focus group moderator', '', 'Discussion guide, moderation, findings memo'],
  ['French translator', '', 'Script and caption translation, French caption QC'],
]

const PRICE: [string, string][] = [
  ['Phase 1: Assessment & Planning', '$8,100'],
  ['Phase 2: Development & User Feedback', '$43,100'],
  ['Phase 3: Implementation', '$7,075'],
  ['Phase 4: Reporting of metrics', '$1,725'],
]

/** An inline Vimeo player (click to play, with sound). Built from the site's embed helper, without autoplay. */
function Player({ url, title }: { url: string; title: string }) {
  const src = embedUrl(url || undefined, 'play')?.replace('autoplay=1', 'autoplay=0')
  return (
    <div className={styles.player}>
      {src ? (
        <iframe src={src} title={title} allow="fullscreen; picture-in-picture" allowFullScreen loading="lazy" />
      ) : (
        <div className={styles.pending}>
          <strong>Film link coming</strong>
          <span className="small">{title} will play here shortly.</span>
        </div>
      )}
    </div>
  )
}

function DownloadButton() {
  return (
    <a className="btn btn-primary" href={PDF_HREF} download>
      Download the full proposal (PDF)
    </a>
  )
}

export default function UofaIpcProposalPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <Eyebrow>RFP 2026-0155 · Workstream A – Video Production</Eyebrow>
          <h1 className="display-xl">Creative Thinkers: Young Workers Safety Media Campaign</h1>
          <p className="body-lg muted lede">
            Young workers don’t need another lecture. They need to see someone their age notice a problem, speak up, and get backed up by the crew.
          </p>
          <p className="caption" style={{ marginTop: 'var(--space-6)' }}>
            Prepared for the University of Alberta Injury Prevention Centre by Breaking Ice Productions Inc.
          </p>
          <div className="btn-row" style={{ marginTop: 'var(--space-8)' }}>
            <DownloadButton />
            <a className="btn btn-secondary" href="#work">Watch the work</a>
          </div>
          <dl className={`stats ${styles.facts}`}>
            <div className="stat"><dt className="caption">Videos from one production</dt><dd className="stat-value">2</dd></div>
            <div className="stat"><dt className="caption">Months, Dec 2026 – Apr 2028</dt><dd className="stat-value">14</dd></div>
            <div className="stat"><dt className="caption">Shoot days on Alberta worksites</dt><dd className="stat-value">2</dd></div>
            <div className="stat"><dt className="caption">Lump sum, before GST</dt><dd className="stat-value">$60K</dd></div>
          </dl>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="understanding">
        <div className="wrap split">
          <div className="stack" style={{ gap: 12 }}>
            <Eyebrow>01 · Understanding</Eyebrow>
            <h2 id="understanding" className="h2">The moment of choice</h2>
          </div>
          <div className={`body-lg ${styles.prose}`}>
            <p className={styles.message}>See it. Say it. Solve it together.</p>
            <p>
              This campaign speaks to young workers in high-risk roles: transport, heavy equipment, construction and similar trades. They are the most likely to be new on a site,
              least likely to know its hazards, and least likely to feel they can question a supervisor.
            </p>
            <p>
              The message is about behaviour, so the videos need to show the moment a young worker sees something wrong and decides whether to say anything. And a video that
              tells young people to speak up, without showing that speaking up works, won’t change much. “Solve it together” puts weight on the crew and the employer.
            </p>
            <p>
              The Young Worker Advisory Committee creates the concept. Our job is to help them shape it and bring it to life on screen, building on IPC’s existing OHS training
              and resources and pointing people to them.
            </p>
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="approach">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>02 · Approach</Eyebrow>
            <h2 id="approach" className="h2">Two videos from one production</h2>
            <p className="body-lg muted" style={{ margin: 0 }}>Both come from the same scripts, cast and shoot days, which keeps the budget on screen.</p>
          </div>
          <div className={styles.cards}>
            <div className={styles.card}>
              <span className={styles.cardLabel}>60 seconds or less</span>
              <h3 className="h3">Social cut</h3>
              <p>One situation, one hazard, the three steps. Built for TikTok, Reels and YouTube Shorts: a hook in the first two seconds, vertical first, readable with the sound off.</p>
            </div>
            <div className={styles.card}>
              <span className={styles.cardLabel}>2 to 3 minutes</span>
              <h3 className="h3">Extended cut</h3>
              <p>For YouTube, partner websites, classrooms and site orientations. The same characters through more than one situation, with room for the supervisor’s response, the crew’s fix and where to find IPC’s resources.</p>
            </div>
          </div>

          <div className={`sec-head ${styles.sketches}`}>
            <h3 className="h3">Bringing the committee’s concept to life</h3>
            <p style={{ margin: 0 }}>
              We don’t come in with our own concept. We build on theirs: ideas, references and short treatments that show how it could look and sound, then storyboards and
              scripts for both videos once the committee and IPC settle on a direction. Two quick sketches of how that might go:
            </p>
          </div>
          <div className={styles.cards}>
            <div className={styles.card}>
              <span className={styles.cardLabel}>If the idea is a first week on the job</span>
              <h3 className="h3">“Sketchy”</h3>
              <p>Something looks off: a loader backing up with someone in the blind spot, an unguarded edge, a frayed strap. We stay in the young worker’s point of view and hear what they’re thinking. They hesitate, then say it. The crew stops, fixes it and gets back to work. Everyday, and a little funny.</p>
            </div>
            <div className={styles.card}>
              <span className={styles.cardLabel}>If the idea is the moment before it goes wrong</span>
              <h3 className="h3">“Rewind”</h3>
              <p>A scene plays toward the moment before something goes wrong, then freezes and rewinds. On the second pass, someone sees it, says it, and the crew solves it. Nothing bad is ever shown happening, and the three beats map straight onto See, Say, Solve.</p>
            </div>
          </div>
          <p className={`caption ${styles.note}`}>Illustrations of our approach, not proposals for the concept.</p>

          <div className={`sec-head ${styles.sketches}`} style={{ marginBottom: 0 }}>
            <h3 className="h3">Built with real young workers</h3>
            <p style={{ margin: 0 }}>
              We recommend casting real apprentices and young workers through IPC’s trade school, union and employer partners, with actors only where a scene needs them.
              Real workers wear PPE properly and sound like themselves, and audiences notice.
            </p>
          </div>
        </div>
      </section>

      <section id="work" className="section ruled" aria-labelledby="samples">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>03 · Work samples</Eyebrow>
            <h2 id="samples" className="h2">Technical made clear enough to act on</h2>
          </div>
          <div className={styles.samples}>
            {SAMPLES.map((s, i) => (
              <article key={s.title} className={styles.sample} aria-labelledby={`sample-${i + 1}`}>
                <Player url={s.url} title={s.title} />
                <div className={styles.sampleText}>
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="step-num">Sample {i + 1}</span>
                    <h3 id={`sample-${i + 1}`} className="h3">{s.title}</h3>
                    <span className="caption">{s.client} · {s.length}</span>
                  </div>
                  <dl>
                    <div><dt>Challenge</dt><dd>{s.challenge}</dd></div>
                    <div><dt>Approach</dt><dd>{s.approach}</dd></div>
                    <div><dt>{s.resultLabel}</dt><dd>{s.result}</dd></div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="ideas">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>04 · Ideas, technology and engagement</Eyebrow>
            <h2 id="ideas" className="h2">Made for how young workers watch</h2>
          </div>
          <ul className={styles.ideas}>
            {IDEAS.map((idea) => (
              <li key={idea.title}>
                <h3 className="h3">{idea.title}</h3>
                <p className="muted">{idea.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="timeline">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>05 · Timeline</Eyebrow>
            <h2 id="timeline" className="h2">Fourteen months, four phases</h2>
            <p className="body-lg muted" style={{ margin: 0 }}>An early-summer shoot catches construction season, when many young workers start new jobs.</p>
          </div>
          <ol className={styles.phases}>
            {PHASES.map((p) => (
              <li key={p.n}>
                <span className="step-num">{p.n} · {p.when}</span>
                <h3 className="h3">{p.name}</h3>
                <p className="muted">{p.body}</p>
              </li>
            ))}
          </ol>
          <dl className={styles.milestones}>
            {MILESTONES.map(([when, what]) => (
              <div key={when}><dt>{when}</dt><dd>{what}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="team">
        <div className="wrap split">
          <div className="stack" style={{ gap: 12 }}>
            <Eyebrow>06 · Team</Eyebrow>
            <h2 id="team" className="h2">Lean and senior</h2>
            <p className="muted" style={{ margin: 0 }}>The person who meets the committee in January directs the shoot and cuts the videos, so nothing gets lost in handoffs.</p>
          </div>
          <div>
            <dl className={styles.team}>
              {TEAM.map(([role, who, does]) => (
                <div key={role}>
                  <dt>{role}</dt>
                  <dd>{who && <span>{who}</span>}{does}</dd>
                </div>
              ))}
            </dl>
            <div className={`stack ${styles.bio}`} style={{ gap: 12 }}>
              <h3 className="h3">Josh Ferguson, Owner / Creative Director</h3>
              <p style={{ margin: 0 }}>
                Josh founded Breaking Ice Productions in Norman Wells, NT in 2022 and now works from Stony Plain and Norman Wells. He leads every project personally, and directs,
                shoots and edits the company’s films himself, most of them for industry, education and community clients in the Sahtú region. He holds a Transport Canada drone pilot certificate.
                Recent work includes Imperial Oil’s management plans explainer and aquatic effects monitoring video, the Closing a Century decommissioning series in Norman Wells,
                and education films for the Sahtú Divisional Education Council.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section ruled" aria-labelledby="price">
        <div className="wrap split">
          <div className="stack" style={{ gap: 12 }}>
            <Eyebrow>07 · Price</Eyebrow>
            <h2 id="price" className="h2">$60,000 lump sum</h2>
            <p className="muted" style={{ margin: 0 }}>
              In Canadian funds, before GST. It covers labour, equipment, licences, French translation, the focus group and on-set expenses. Pass-through costs are charged at cost, with no markup.
            </p>
          </div>
          <dl className={styles.price}>
            {PRICE.map(([phase, amount]) => (
              <div key={phase}><dt>{phase}</dt><dd>{amount}</dd></div>
            ))}
            <div className={styles.total}><dt>Lump sum, before GST</dt><dd>$60,000</dd></div>
          </dl>
        </div>
      </section>

      <section className="closing shard-field band" aria-labelledby="contact">
        <div className="wrap">
          <span className="eyebrow">The full proposal</span>
          <h2 id="contact" className="h1">Past the surface.</h2>
          <p className="body-lg muted" style={{ margin: 0, maxWidth: '52ch' }}>
            Scope by phase, deliverables, compliance, pricing detail and references are in the full proposal.
          </p>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <DownloadButton />
          </div>
          <div className={styles.contact}>
            <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            <a href={`tel:+1${PHONE.replace(/\D/g, '')}`}>{PHONE}</a>
          </div>
        </div>
      </section>
    </>
  )
}
