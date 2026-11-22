/* eslint-disable @typescript-eslint/no-explicit-any */
export type Img = { asset?: { _ref?: string; _id?: string }; alt?: string; caption?: string; hotspot?: any; crop?: any } | null
export type PT = any[] | null

export type ProjectCard = {
  _id: string
  _updatedAt?: string
  title: string
  slug: string
  storyType?: 'film' | 'photo'
  client?: string
  location?: string
  category?: string
  cardVideo?: string
  thumbnail?: Img
  sample?: boolean
}

export type Service = {
  _id: string
  _updatedAt?: string
  title: string
  slug: string
  summary?: string
  cardImage?: Img
  showAsFullCard?: boolean
  heroHeadline?: string
  clip?: string
  description?: PT
  whoItsFor?: PT
  included?: string[]
  timeline?: string
  timelineNote?: string
  relatedProjects?: ProjectCard[]
  testimonial?: Testimonial | null
  faq?: { _key: string; question?: string; answer?: string }[]
  /** Closing band headline (code fallback only; Sanity services use the site-wide one). */
  closingHeadline?: string
  seo?: Seo
}

export type Testimonial = {
  _id: string
  quote: string
  name?: string
  role?: string
  organization?: string
  projectSlug?: string
}

export type Location = {
  _id: string
  title: string
  slug: string
  baseLine?: string
  summary?: string
  cardImage?: Img
  headline?: string
  intro?: PT
  heroImage?: Img
  base?: string
  email?: string
  phone?: string
  travelNote?: string
  areaServed?: { _key: string; name?: string; places?: string[] }[]
  mapImage?: Img
  storiesEyebrow?: string
  storiesTitle?: string
  areaEyebrow?: string
  areaTitle?: string
  closingHeadline?: string
  seo?: Seo
}

export type Seo = { title?: string; description?: string; image?: Img } | null

export type ProcessStep = {
  _key: string
  title: string
  line?: string
  clip?: string
  poster?: Img
  youBring?: string
  youGet?: string
  inside?: PT
  insideText?: string[]
}

export type Settings = {
  tagline: string
  footerDescription: string
  email: string
  phone: string
  bookingLink?: string
  social: { instagram?: string; linkedin?: string; youtube?: string; vimeo?: string }
  primaryCta: string
  secondaryCta: string
  closingEyebrow: string
  closingHeadline: string
  processSteps: ProcessStep[]
  copyrightName: string
  notFoundEyebrow: string
  notFoundHeadline: string
  notFoundMessage: string
  defaultSeo?: Seo
  locations: Pick<Location, '_id' | 'title' | 'slug' | 'baseLine' | 'base'>[]
}

export type Offer = {
  _id: string
  _updatedAt?: string
  name: string
  slug: string
  order?: number
  /** Optional small label on the ladder card. Empty by default. */
  badge?: string
  /** The emphasised (navy) step on the ladder. */
  featured?: boolean
  /** Ladder card: one-liner, short blurb and link text. */
  ladderLine?: string
  ladderBlurb?: string
  ladderLink?: string
  /** Offer page hero. */
  heroHeadline?: string
  oneLiner?: string
  description?: PT
  /** Code fallback for description: plain paragraphs. */
  descriptionText?: string[]
  /** One short line under the description (e.g. the retainers note on the Brand Engine). */
  descriptionNote?: string
  includedTitle?: string
  included?: string[]
  idealFor?: string[]
  timeline?: string
  timelineNote?: string
  ctaLabel?: string
  closingHeadline?: string
  heroImage?: Img
  hookVideo?: string
  faq?: { _key: string; question?: string; answer?: string }[]
  relatedServices?: Pick<Service, '_id' | 'title' | 'slug'>[]
  relatedProjects?: ProjectCard[]
  seo?: Seo
  /** Code fallbacks for the SEO tab. */
  seoTitle?: string
  seoDescription?: string
}

export type FaqItem = {
  _id: string
  question: string
  answer?: string
  category?: string
  order?: number
}

/** A featured story on Home: the card plus what the carousel shows. */
export type FeaturedStory = ProjectCard & {
  year?: number
  heroVideo?: string
  /** One line on what the film had to do (Sanity: project → “The job”). */
  jobLine?: string
  summary?: string
  still?: Img
}

export type Filmstrip = {
  title: string
  intro: string
  /** The lead frame (“One shoot”). */
  lead: string
  /** Small note under the strip. */
  note?: string
  frames: { _key: string; title: string; line?: string; kind: FilmstripKind; image: Img; extra: Img }[]
}

/** How a filmstrip frame shows its picture: as the real thing it stands for. */
export type FilmstripKind = 'film' | 'cuts' | 'social' | 'photos' | 'web' | 'plan'
