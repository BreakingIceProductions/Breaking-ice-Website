/* eslint-disable @typescript-eslint/no-explicit-any */
export type Img = { asset?: { _ref?: string; _id?: string }; alt?: string; caption?: string; hotspot?: any; crop?: any } | null
export type PT = any[] | null

export type ProjectCard = {
  _id: string
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
  title: string
  slug: string
  summary?: string
  cardImage?: Img
  showAsFullCard?: boolean
  heroHeadline?: string
  clip?: string
  whoItsFor?: PT
  included?: string[]
  timeline?: string
  timelineNote?: string
  relatedProjects?: ProjectCard[]
  testimonial?: Testimonial | null
  faq?: { _key: string; question?: string; answer?: string }[]
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
  seo?: Seo
}

export type Seo = { title?: string; description?: string; image?: Img } | null

export type ProcessStep = {
  _key: string
  title: string
  line?: string
  clip?: string
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
  defaultSeo?: Seo
  locations: Pick<Location, '_id' | 'title' | 'slug' | 'baseLine'>[]
}
