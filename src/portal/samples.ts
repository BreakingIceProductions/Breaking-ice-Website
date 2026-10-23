import type { ClientProject, DriveFile, PortalClient, PortalSettings } from './types'

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
      {
        _key: 'd1',
        title: 'Main film',
        version: 2,
        status: 'awaiting-feedback',
        shareUrl: 'https://vimeo.com/reviews/sample/videos/1',
        feedbackDue: date(4),
        length: '4:52',
        notes: 'We tightened the opening and moved the elder’s story earlier. Look at the ending: is the closing line the right note?',
      },
      {
        _key: 'd2',
        title: '30-second social cut',
        version: 1,
        status: 'awaiting-feedback',
        shareUrl: 'https://vimeo.com/reviews/sample/videos/1',
        feedbackDue: date(6),
        length: '0:30',
        notes: 'First pass at the cut-down. Captions are burned in for sound-off viewing.',
      },
      { _key: 'd4', title: 'Event poster', version: 2, status: 'awaiting-feedback', fileUrl: 'https://drive.google.com/file/d/sample-poster/view', fileName: 'Event poster.pdf', notes: 'Bigger date, logo moved to the bottom.' },
      { _key: 'd3', title: 'Interview selects', version: 1, status: 'approved', shareUrl: 'https://vimeo.com/reviews/sample/videos/1', length: '18:10' },
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
    status: 'delivered',
    stage: 4,
    nextStep: 'Delivered. Finals are in Files whenever you need them.',
    summary: 'Four short safety videos for crews, delivered in English with captions.',
    deliverables: [{ _key: 'd1', title: 'Safety series (4 videos)', version: 3, status: 'approved', shareUrl: 'https://vimeo.com/reviews/sample/videos/1' }],
    activity: [{ _key: 'a1', at: iso(-40), text: 'Final files delivered', kind: 'approved' }],
    client: SAMPLE_CLIENT,
  },
]

export const sampleFiles = (): DriveFile[] => [
  { id: 'f1', name: 'logo-pack.zip', size: 48_200_000, mimeType: 'application/zip', modifiedTime: iso(-1), from: 'From client', uploadedBy: 'Alex Sample' },
  { id: 'f2', name: 'archival-photos-1990s.zip', size: 1_260_000_000, mimeType: 'application/zip', modifiedTime: iso(-9), from: 'From client', uploadedBy: 'Alex Sample' },
  { id: 'f3', name: 'Interview questions v2.pdf', size: 184_000, mimeType: 'application/pdf', modifiedTime: iso(-12), from: 'From Breaking Ice' },
  { id: 'f4', name: 'Brand fonts.zip', size: 3_400_000, mimeType: 'application/zip', modifiedTime: iso(-14), from: 'From client', uploadedBy: 'Alex Sample' },
  { id: 'f5', name: 'Music options.mp3', size: 9_800_000, mimeType: 'audio/mpeg', modifiedTime: iso(-15), from: 'From Breaking Ice' },
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
