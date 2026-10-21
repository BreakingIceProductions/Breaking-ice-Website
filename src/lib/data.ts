/* eslint-disable @typescript-eslint/no-explicit-any */
import { sanityFetch } from '@/sanity/client'
import { DEFAULT_SETTINGS, SAMPLE_LOCATIONS, SAMPLE_PROJECTS, SAMPLE_SERVICES, SAMPLE_TESTIMONIALS } from './samples'
import type { Location, ProjectCard, Service, Settings, Testimonial } from './types'

/** Use the Sanity value when it has content, otherwise the fallback. */
const pick = <T,>(value: T | null | undefined, fallback: T): T => {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string' && value.trim() === '') return fallback
  if (Array.isArray(value) && value.length === 0) return fallback
  return value
}

const CARD = `_id, title, "slug": slug.current, storyType, client, location, category, cardVideo, thumbnail`
const TESTIMONIAL = `_id, quote, name, role, organization, "projectSlug": project->slug.current`

export async function getSettings(): Promise<Settings> {
  const data = await sanityFetch<any>(`{
    "s": *[_id == "siteSettings"][0]{ tagline, footerDescription, email, phone, bookingLink, social, primaryCta, secondaryCta,
      closingEyebrow, closingHeadline, copyrightName, defaultSeo, notFoundEyebrow, notFoundHeadline, notFoundMessage,
      processSteps[]{ _key, title, line, clip, youBring, youGet, inside } },
    "locations": *[_type == "location" && defined(slug.current)] | order(title asc){ _id, title, "slug": slug.current, baseLine }
  }`)
  const s = data?.s ?? {}
  const d = DEFAULT_SETTINGS
  return {
    tagline: pick(s.tagline, d.tagline),
    footerDescription: pick(s.footerDescription, d.footerDescription),
    email: pick(s.email, d.email),
    phone: pick(s.phone, d.phone),
    bookingLink: s.bookingLink,
    social: s.social ?? {},
    primaryCta: pick(s.primaryCta, d.primaryCta),
    secondaryCta: pick(s.secondaryCta, d.secondaryCta),
    closingEyebrow: pick(s.closingEyebrow, d.closingEyebrow),
    closingHeadline: pick(s.closingHeadline, d.closingHeadline),
    processSteps: pick(s.processSteps, d.processSteps),
    copyrightName: pick(s.copyrightName, d.copyrightName),
    notFoundEyebrow: pick(s.notFoundEyebrow, d.notFoundEyebrow),
    notFoundHeadline: pick(s.notFoundHeadline, d.notFoundHeadline),
    notFoundMessage: pick(s.notFoundMessage, d.notFoundMessage),
    defaultSeo: s.defaultSeo,
    locations: pick(data?.locations, d.locations),
  }
}

export async function getProjects(): Promise<ProjectCard[]> {
  const rows = await sanityFetch<ProjectCard[]>(
    `*[_type == "project" && defined(slug.current)] | order(coalesce(order, 999) asc, _createdAt desc){ ${CARD} }`,
  )
  return pick(rows, SAMPLE_PROJECTS)
}

export async function getHome() {
  const data = await sanityFetch<any>(`{
    "page": *[_id == "homePage"][0]{ ..., testimonials[]->{ ${TESTIMONIAL} }, founder->{ name, role, portrait, onLocationPhoto, founderNote } },
    "featured": *[_type == "project" && featuredOnHome == true && defined(slug.current)] | order(coalesce(order, 999) asc)[0...6]{ ${CARD} },
    "latest": *[_type == "project" && defined(slug.current)] | order(coalesce(order, 999) asc, _createdAt desc)[0...6]{ ${CARD} },
    "logos": *[_type == "clientLogo" && showInStrip != false] | order(coalesce(order, 999) asc){ _id, name, logo }
  }`)
  const page = data?.page ?? {}
  const projects: ProjectCard[] = pick(data?.featured, pick(data?.latest, SAMPLE_PROJECTS))
  const testimonials: Testimonial[] = pick(page.testimonials?.filter(Boolean), SAMPLE_TESTIMONIALS)
  return {
    heroReel: page.heroReel as string | undefined,
    heroPoster: page.heroPoster,
    fullReel: page.fullReel as string | undefined,
    heroEyebrow: pick(page.heroEyebrow, 'Video production · Alberta & the Northwest Territories'),
    heroHeadline: pick(page.heroHeadline, 'We tell the human stories inside organizations.'),
    heroSubline: pick(page.heroSubline, 'Films for companies, communities, crews and nonprofits. We take the time to earn trust, so the real story comes out.'),
    introEyebrow: pick(page.introEyebrow, 'Who we are'),
    introBody: pick(
      page.introBody,
      'Every company, community and crew is made of people who care about what they do. We take the time to listen, earn trust and find what actually matters, then we make the film.',
    ),
    stats: pick<{ _key?: string; value: string; label: string }[]>(page.stats, [
      { value: '[00]', label: '[Stat: projects delivered]' },
      { value: '[00]', label: '[Stat: years filming in the North]' },
      { value: '[00]', label: '[Stat: communities filmed in]' },
      { value: '[00]', label: '[Stat: organizations served]' },
    ]),
    logoStripEyebrow: pick(page.logoStripEyebrow, 'Trusted by'),
    logoStripTitle: pick(page.logoStripTitle, 'Organizations we’ve worked with'),
    processEyebrow: pick(page.processEyebrow, 'How we work'),
    processTitle: pick(page.processTitle, 'Four steps, every time'),
    storiesEyebrow: pick(page.storiesEyebrow, 'Selected stories'),
    storiesTitle: pick(page.storiesTitle, 'Stories we’ve told'),
    testimonialsEyebrow: pick(page.testimonialsEyebrow, 'Testimonials'),
    testimonialsTitle: pick(page.testimonialsTitle, 'In their words'),
    testimonials,
    checklistEyebrow: pick(page.checklistEyebrow, 'Sound familiar?'),
    checklistTitle: pick(page.checklistTitle, 'Is this you?'),
    situations: pick<string[]>(page.situations, ['[Situation 1]', '[Situation 2]', '[Situation 3]', '[Situation 4]']),
    checklistClosing: pick(page.checklistClosing, '[Closing line: then let’s talk.]'),
    servicesEyebrow: pick(page.servicesEyebrow, 'Services'),
    servicesTitle: pick(page.servicesTitle, 'What we make'),
    founderEyebrow: pick(page.founderEyebrow, 'Founder'),
    founderTitle: pick(page.founderTitle, 'Hi, I’m Josh.'),
    founder: page.founder ?? null,
    locationsEyebrow: pick(page.locationsEyebrow, 'Locations'),
    locationsTitle: pick(page.locationsTitle, 'Where we work'),
    seo: page.seo ?? null,
    projects,
    logos: (data?.logos ?? []) as { _id: string; name: string; logo?: any }[],
  }
}

export async function getProjectBySlug(slug: string) {
  const data = await sanityFetch<any>(
    `*[_type == "project" && slug.current == $slug][0]{
      ${CARD}, year, heroVideo, heroImage, transcript, seo, "captionsUrl": captionsFile.asset->url,
      "services": services[]->{ title, "slug": slug.current },
      caseStudy->{ summary, challenge, peopleHeadline, people, peopleImage, whatMattered, gallery, resultsIntro, results,
        pullQuote->{ ${TESTIMONIAL} }, nextProject->{ ${CARD} }, seo }
    }`,
    { slug },
  )
  if (data) return { ...data, sample: false }
  const sample = SAMPLE_PROJECTS.find((p) => p.slug === slug)
  return sample ? { ...sample, year: undefined, services: [], caseStudy: null } : null
}

export async function getNextProject(currentSlug: string): Promise<ProjectCard | null> {
  const all = await getProjects()
  const i = all.findIndex((p) => p.slug === currentSlug)
  return all.length > 1 ? all[(i + 1) % all.length] : null
}

export async function getServices(): Promise<Service[]> {
  const rows = await sanityFetch<Service[]>(
    `*[_type == "service" && defined(slug.current)] | order(coalesce(order, 999) asc){ _id, title, "slug": slug.current, summary, cardImage, showAsFullCard }`,
  )
  return pick(rows, SAMPLE_SERVICES)
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const data = await sanityFetch<Service>(
    `*[_type == "service" && slug.current == $slug][0]{
      _id, title, "slug": slug.current, summary, heroHeadline, clip, description, whoItsFor, included, timeline, timelineNote, faq, seo,
      relatedProjects[]->{ ${CARD} },
      testimonial->{ ${TESTIMONIAL} },
      "fallbackProjects": *[_type == "project" && references(^._id)][0...3]{ ${CARD} }
    }`,
    { slug },
  )
  if (data) {
    const d = data as any
    return { ...data, relatedProjects: pick(data.relatedProjects, d.fallbackProjects ?? []) }
  }
  return SAMPLE_SERVICES.find((s) => s.slug === slug) ?? null
}

/** Services page singleton (adds Process title to the simple-page fields). */
export async function getServicesPage(): Promise<{ eyebrow?: string; headline?: string; intro?: string; processTitle?: string; seo?: any }> {
  return (await sanityFetch<any>(`*[_id == "servicesPage"][0]{ eyebrow, headline, intro, processTitle, seo }`)) ?? {}
}

export async function getLocation(slug: string) {
  const data = await sanityFetch<any>(
    `{
      "loc": *[_type == "location" && slug.current == $slug][0]{ ..., "slug": slug.current },
      "projects": *[_type == "project" && region->slug.current == $slug] | order(_createdAt desc)[0...6]{ ${CARD} }
    }`,
    { slug },
  )
  const sample = SAMPLE_LOCATIONS.find((l) => l.slug === slug) ?? null
  const loc: Location | null = data?.loc ? { ...sample, ...data.loc } : sample
  // Samples only stand in while the location itself is unpublished; a real location with no projects shows none.
  const projects: ProjectCard[] = data?.loc
    ? (data.projects ?? [])
    : pick(
        data?.projects,
        SAMPLE_PROJECTS.filter((p) => (slug === 'alberta' ? p.location?.endsWith('AB') : p.location?.endsWith('NT'))),
      )
  return { loc, projects }
}

export async function getAbout() {
  const page = (await sanityFetch<any>(
    `*[_id == "aboutPage"][0]{ ..., founder->{ name, role, portrait, onLocationPhoto, bio } }`,
  )) ?? {}
  return page
}

export async function getContact() {
  return (await sanityFetch<any>(`*[_id == "contactPage"][0]`)) ?? {}
}

export async function getSimplePage(id: 'storiesPage' | 'servicesPage') {
  return (await sanityFetch<any>(`*[_id == $id][0]{ eyebrow, headline, intro, seo }`, { id })) ?? {}
}

export async function getLegal(slug: string) {
  return sanityFetch<any>(`*[_type == "legalPage" && slug.current == $slug][0]`, { slug })
}

export { pick }
