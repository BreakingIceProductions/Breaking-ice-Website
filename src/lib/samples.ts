/**
 * Sample content shown while Sanity is empty, so every page can be judged.
 * Anything marked "Sample" is a stand-in: replace it in the Studio.
 * Copy here only uses the brand's own lines; no invented clients, stats or quotes.
 */
import type { Location, ProcessStep, ProjectCard, Service, Settings, Testimonial } from './types'

export const SAMPLE_PROJECTS: ProjectCard[] = [
  { _id: 's1', slug: 'sample-shift-change', title: 'Sample story: the crew at shift change', client: '[Client]', location: 'Edmonton, AB', category: 'energy-industry', storyType: 'film', sample: true },
  { _id: 's2', slug: 'sample-first-flight', title: 'Sample story: first flight of the season', client: '[Client]', location: 'Norman Wells, NT', category: 'aviation', storyType: 'film', sample: true },
  { _id: 's3', slug: 'sample-community-voices', title: 'Sample story: voices from the community', client: '[Client]', location: 'The Sahtú, NT', category: 'indigenous-governments', storyType: 'film', sample: true },
  { _id: 's4', slug: 'sample-hands-at-work', title: 'Sample photo story: hands at work', client: '[Client]', location: 'Stony Plain, AB', category: 'nonprofits-communities', storyType: 'photo', sample: true },
  { _id: 's5', slug: 'sample-why-we-build', title: 'Sample story: why we build here', client: '[Client]', location: 'Parkland County, AB', category: 'energy-industry', storyType: 'film', sample: true },
  { _id: 's6', slug: 'sample-open-house', title: 'Sample story: the open house', client: '[Client]', location: 'St. Albert, AB', category: 'nonprofits-communities', storyType: 'film', sample: true },
]

const SERVICE_ROWS: [string, string, string, boolean][] = [
  ['organizational-brand-films', 'Organizational & brand films', 'Films that show who your organization is through the people who make it work.', true],
  ['social-stories', 'Social stories', 'Short, honest pieces built for the feeds your people actually scroll.', true],
  ['event-coverage', 'Event coverage', 'The room, the speakers and the moments in between, cut fast.', true],
  ['retainers', 'Retainers', 'A steady rhythm of stories through the year, planned together.', true],
  ['documentary', 'Documentary', 'Longer stories with the time and care they need.', true],
  ['photography', 'Photography', 'Stills alongside our film work.', false],
]

export const SAMPLE_SERVICES: Service[] = SERVICE_ROWS.map(([slug, title, summary, full], i) => ({
  _id: `svc-${i}`,
  slug,
  title,
  summary,
  showAsFullCard: full,
  description: [
    '[Two or three short paragraphs: what this service is, in plain words, and what working on it together looks like.]',
    '[What makes the result worth having: who watches it, where it lives, and what it helps your people do.]',
  ].map((text, n) => ({
    _type: 'block',
    _key: `d${n}`,
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: `d${n}s`, text, marks: [] }],
  })),
  included: ['[Included item]', '[Included item]', '[Included item]', '[Included item]'],
  timeline: '[e.g. 4–8 weeks]',
  timelineNote: '[From first conversation to delivery, and what shapes it]',
  faq: [1, 2, 3, 4].map((n) => ({ _key: `q${n}`, question: `[Question ${n}]`, answer: '[Answer: two to four plain sentences.]' })),
}))

export const SAMPLE_LOCATIONS: Location[] = [
  {
    _id: 'loc-ab',
    slug: 'alberta',
    title: 'Alberta',
    baseLine: 'Based in Stony Plain · Edmonton region',
    summary: '[Short description of the work we do across Alberta]',
    headline: 'Video production across Alberta',
    base: 'Stony Plain, AB',
    travelNote: '[How far we travel from Stony Plain, and how travel is handled]',
    areaServed: [
      { _key: 'a', name: 'Edmonton region', places: ['Stony Plain', 'Spruce Grove', 'Edmonton', 'St. Albert', 'Parkland County'] },
      { _key: 'b', name: 'And across Alberta', places: ['[Add places as you work there]'] },
    ],
  },
  {
    _id: 'loc-nt',
    slug: 'northwest-territories',
    title: 'Northwest Territories',
    baseLine: 'Based in Norman Wells · the Sahtú',
    summary: '[Short description of the work we do across the NWT]',
    headline: 'Video production across the Northwest Territories',
    base: 'Norman Wells, NT',
    travelNote: '[How we reach fly-in and winter-road communities, and how travel is planned]',
    areaServed: [
      { _key: 'a', name: 'The Sahtú', places: ['Norman Wells', 'Tulita', 'Délı̨nę', 'Fort Good Hope', 'Colville Lake'] },
      { _key: 'b', name: 'And across the territory', places: ['Including Yellowknife'] },
    ],
  },
]

export const SAMPLE_STEPS: ProcessStep[] = [
  ['Listen', 'We start with your people, not a script.'],
  ['Earn trust', 'We take the time a story needs before the camera comes out.'],
  ['Find what matters', 'We look for the true line, not the polished one.'],
  ['Craft the film', 'We cut it with care, and we hit the deadline.'],
].map(([title, line], i) => ({
  _key: `step-${i}`,
  title,
  line,
  youBring: '[What you bring]',
  youGet: '[What you get]',
  insideText: ['[What’s inside: a few short points]'],
}))

export const SAMPLE_TESTIMONIALS: Testimonial[] = [1, 2, 3].map((n) => ({
  _id: `t${n}`,
  quote: `[A real quote from a client goes here. Testimonial ${n}.]`,
  name: '[Name]',
  role: '[Role]',
  organization: '[Organization]',
}))

export const DEFAULT_SETTINGS: Settings = {
  tagline: 'Past the surface.',
  footerDescription: 'Video production for the human stories inside organizations. Alberta and the Northwest Territories.',
  email: '[email]',
  phone: '[phone]',
  social: {},
  primaryCta: 'Start a conversation',
  secondaryCta: 'See the stories',
  closingEyebrow: 'Start here',
  closingHeadline: 'Have a story worth telling?',
  processSteps: SAMPLE_STEPS,
  copyrightName: 'Breaking Ice Productions',
  notFoundEyebrow: '404 · Page not found',
  notFoundHeadline: 'This page isn’t here.',
  notFoundMessage: 'But the stories are.',
  locations: SAMPLE_LOCATIONS.map(({ _id, title, slug, baseLine, base }) => ({ _id, title, slug, baseLine, base })),
}
