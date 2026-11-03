import type { ClientProject, DriveFile, PortalClient, PortalQuote, PortalSettings } from './types'

/**
 * Preview mode: a made-up client so the portal can be judged before any
 * accounts are connected. Nothing here is real and nothing is sent anywhere.
 */
const day = 86_400_000
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString()
const date = (offsetDays: number) => iso(offsetDays).slice(0, 10)

export const DEMO_EMAIL = 'preview@sample.client'

export const SAMPLE_CLIENT: PortalClient = {
  _id: 'sample-client',
  organizationName: 'Sample Development Corporation',
  contacts: [{ _key: 'c1', name: 'Alex Sample', email: DEMO_EMAIL, role: 'Communications lead', getsEmails: true }],
}

export const sampleProjects = (): ClientProject[] => [
  {
    _id: 'sample-p1',
    title: 'Community voices film',
    slug: 'sample-community-voices',
    startDate: date(-48),
    status: 'in-review',
    stage: 4,
    stageDates: ['Sep 8–12', 'Sep 15–26', 'Sep 29–Oct 3', 'Oct 6–24'],
    nextStep: 'Your feedback on the main film, then we lock picture.',
    summary:
      'A five-minute film for the annual general assembly: elders, youth and staff on what the last ten years built, and where it goes next. Two cut-downs for social follow.',
    links: [
      { _key: 'l1', title: 'Poster: Water management', url: 'https://drive.google.com/file/d/sample/view', note: 'Print-ready PDF' },
      { _key: 'l2', title: 'Script v3', url: 'https://docs.google.com/document/d/sample/edit', note: 'Draft for your comments' },
    ],
    keyDates: [
      { _key: 'k1', label: 'Feedback on main film', date: date(4) },
      { _key: 'k2', label: 'Final delivery', date: date(12) },
      { _key: 'k3', label: 'Annual general assembly', date: date(19) },
    ],
    deliverables: [
      { _key: 'd0', title: 'Main film', category: 'video', version: 1, date: date(-9), status: 'changes-requested', shareUrl: 'https://vimeo.com/reviews/sample/videos/1', length: '5:20' },
      {
        _key: 'd1',
        title: 'Main film',
        category: 'video',
        version: 2,
        date: date(-1),
        status: 'awaiting-feedback',
        shareUrl: 'https://vimeo.com/reviews/sample/videos/1',
        feedbackDue: date(4),
        length: '4:52',
        notes: 'We tightened the opening and moved the elder’s story earlier. Look at the ending: is the closing line the right note?',
      },
      {
        _key: 'd2',
        title: '30-second social cut',
        category: 'video',
        version: 1,
        date: date(-1),
        status: 'awaiting-feedback',
        shareUrl: 'https://vimeo.com/reviews/sample/videos/1',
        feedbackDue: date(6),
        length: '0:30',
        notes: 'First pass at the cut-down. Captions are burned in for sound-off viewing.',
      },
      { _key: 'd5', title: 'Event poster', category: 'document', version: 1, date: date(-6), status: 'changes-requested', fileUrl: 'https://drive.google.com/file/d/sample-poster-1/view', fileName: 'Event poster.pdf', feedback: [{ _key: 'f1', at: iso(-4), who: 'Alex Sample', action: 'changes', note: 'Can the date be bigger? And move our logo to the bottom.' }] },
      { _key: 'd4', title: 'Event poster', category: 'document', version: 2, date: date(-1), status: 'awaiting-feedback', fileUrl: 'https://drive.google.com/file/d/sample-poster/view', fileName: 'Event poster.pdf', notes: 'Bigger date, logo moved to the bottom.' },
      { _key: 'd3', title: 'Interview selects', category: 'video', version: 1, date: date(-12), status: 'approved', final: true, shareUrl: 'https://vimeo.com/reviews/sample/videos/1', length: '18:10' },
    ],
    activity: [
      { _key: 'a1', at: iso(-0.08), text: 'Version 2 of Main film is ready for review', kind: 'version' },
      { _key: 'a2', at: iso(-1), text: 'Alex Sample uploaded logo-pack.zip', kind: 'upload' },
      { _key: 'a3', at: iso(-3), text: 'New comment on Main film v1', kind: 'comment' },
      { _key: 'a4', at: iso(-3.2), text: 'Alex Sample viewed Main film v1', kind: 'view' },
      { _key: 'a5', at: iso(-6), text: 'Interview selects approved', kind: 'approved' },
    ],
    client: SAMPLE_CLIENT,
  },
  {
    _id: 'sample-p2',
    title: 'Annual report video',
    slug: 'sample-annual-report',
    startDate: date(-26),
    status: 'in-production',
    stage: 2,
    stageDates: ['Oct 1–3', 'Oct 6–17', 'Oct 20–24', 'Oct 27–Nov 14'],
    nextStep: 'Interview day on site. We’ll confirm times with you this week.',
    summary: 'A short film to open the annual report presentation, built around three people from the year.',
    keyDates: [
      { _key: 'k1', label: 'Interviews on site', date: date(9) },
      { _key: 'k2', label: 'First cut', date: date(21) },
    ],
    deliverables: [],
    activity: [{ _key: 'a1', at: iso(-2), text: 'Project started', kind: 'note' }],
    client: SAMPLE_CLIENT,
  },
  {
    _id: 'sample-p3',
    title: 'Spring safety series',
    slug: 'sample-safety-series',
    startDate: date(-190),
    status: 'delivered',
    stage: 4,
    nextStep: 'Delivered. Finals are in Files whenever you need them.',
    summary: 'Four short safety videos for crews, delivered in English with captions.',
    deliverables: [{ _key: 'd1', title: 'Safety series (4 videos)', category: 'video', version: 3, date: date(-150), status: 'approved', final: true, shareUrl: 'https://vimeo.com/reviews/sample/videos/1' }],
    activity: [{ _key: 'a1', at: iso(-40), text: 'Final files delivered', kind: 'approved' }],
    client: SAMPLE_CLIENT,
  },
]

export const sampleFiles = (): DriveFile[] => [
  { id: 'f1', name: 'logo-pack.zip', size: 48_200_000, mimeType: 'application/zip', modifiedTime: iso(-1), from: 'Reference Assets', uploadedBy: 'Alex Sample' },
  { id: 'f2', name: 'archival-photos-1990s.zip', size: 1_260_000_000, mimeType: 'application/zip', modifiedTime: iso(-9), from: 'Reference Assets', uploadedBy: 'Alex Sample' },
  { id: 'f3', name: 'Interview questions v2.pdf', size: 184_000, mimeType: 'application/pdf', modifiedTime: iso(-12), from: 'Reference Assets' },
  { id: 'f4', name: 'Brand fonts.zip', size: 3_400_000, mimeType: 'application/zip', modifiedTime: iso(-14), from: 'Reference Assets', uploadedBy: 'Alex Sample' },
  { id: 'f5', name: 'Music options.mp3', size: 9_800_000, mimeType: 'audio/mpeg', modifiedTime: iso(-15), from: 'Reference Assets' },
  { id: 'f6', name: 'Safety series 1–4 · Web 1080p.mp4', size: 612_000_000, mimeType: 'video/mp4', modifiedTime: iso(-150), from: 'Final Files' },
  { id: 'f7', name: 'Safety series 1–4 · Vertical 9x16.mp4', size: 398_000_000, mimeType: 'video/mp4', modifiedTime: iso(-150), from: 'Final Files' },
  { id: 'f8', name: 'Safety series 1–4 · ProRes master.mov', size: 18_400_000_000, mimeType: 'video/quicktime', modifiedTime: iso(-150), from: 'Final Files' },
  { id: 'f9', name: 'Safety series 1–4 · Captions EN.srt', size: 24_000, mimeType: 'application/x-subrip', modifiedTime: iso(-150), from: 'Final Files' },
  { id: 'f10', name: 'Safety series stills.zip', size: 86_000_000, mimeType: 'application/zip', modifiedTime: iso(-150), from: 'Final Files' },
]

export const DEFAULT_PORTAL: Required<Omit<PortalSettings, 'signInImage' | 'feedbackVideo' | 'copyTo'>> & Pick<PortalSettings, 'signInImage' | 'feedbackVideo' | 'copyTo'> = {
  signInHeadline: 'Your projects, in one place.',
  signInIntro: 'We’ll email you a link and a code. No password to remember.',
  checkEmailHeadline: 'Check your email',
  checkEmailMessage: 'If that address is on a project, a sign-in link and a 6-digit code are on their way. They work for 15 minutes.',
  dashboardGreeting: 'Hi {name}.',
  nothingToReview: 'You’re all caught up. We’ll email you when there’s something new to watch.',
  newProjectLine: 'Have another story in mind? We’d love to hear it.',
  feedbackSteps: [
    'Watch it here, or open the review page on Vimeo. You don’t need a Vimeo account, just your name.',
    'Pause anywhere and type a note. It’s pinned to that exact moment.',
    'When you’re happy with it, reply to our email or tell us it’s approved.',
  ],
  filesIntro: 'Send us logos, photos, documents or music here. Anything we share shows up here too.',
  producer: { name: 'Josh Ferguson', role: 'Producer & creative director', email: 'josh@breakingiceproductions.com' },
  newVersionSubject: 'New version ready: {title} v{version}',
  newVersionIntro: 'Hi {name}, a new version is ready for you to watch.',
  reminderSubject: 'Friendly nudge: {title} v{version}',
  reminderIntroUnviewed: 'Hi {name}, no pressure: this one is still waiting for your eyes.',
  reminderIntroViewed: 'Hi {name}, any thoughts on this version, or is it good to go?',
  reminderDays: 7,
  signOff: 'Josh',
  signInImage: undefined,
  feedbackVideo: undefined,
  copyTo: undefined,
}

/** One quote waiting for a signature and one already signed, for the preview. */
export const sampleQuotes = (): PortalQuote[] => [
  {
    projectId: 'sample-q1',
    slug: 'sample-recruitment-film',
    title: 'Teacher recruitment film',
    org: SAMPLE_CLIENT.organizationName,
    pipelineStage: 'quoted',
    version: 1,
    fileName: 'Teacher recruitment film_Quote.pdf',
    summary: 'A three-minute recruitment film and three 30-second cut-downs, shot over two days in the community, ready for the spring hiring season.',
    includes: ['Pre-production: story call, interview plan and shot list', 'Two shoot days with a two-person crew', 'Edit with two rounds of changes', 'Music licence, captions and colour grade', 'Final files for web and social'],
    validUntil: date(21),
    sharedAt: iso(-1),
    total: 14800,
    deposit: 7400,
  },
  {
    projectId: 'sample-p1',
    slug: 'sample-community-voices',
    title: 'Community voices film',
    org: SAMPLE_CLIENT.organizationName,
    pipelineStage: 'roughcut',
    version: 2,
    fileName: 'Community voices film_Quote.pdf',
    sharedAt: iso(-60),
    total: 18500,
    deposit: 9250,
    signature: { name: 'Alex Sample', title: 'Communications lead', org: SAMPLE_CLIENT.organizationName, at: iso(-55), method: 'typed', total: 18500, deposit: 9250, certificateId: 'SAMP-LE00-0000-0001' },
  },
]
