/* eslint-disable @typescript-eslint/no-explicit-any */
import { sanityFetch } from '@/sanity/client'
import { DEFAULT_SETTINGS, SAMPLE_LOCATIONS, SAMPLE_PROJECTS, SAMPLE_SERVICES, SAMPLE_TESTIMONIALS } from './samples'
import { COPY, FALLBACK_FAQ, FILMSTRIP_KINDS, FALLBACK_OFFERS, FALLBACK_TRAINING_SERVICE, OFFER_FAQ_CATEGORY, RETIRED_SERVICE_SLUGS, WHO_WE_ARE } from './offers'
import type { FaqItem, FeaturedStory, Filmstrip, FilmstripKind, Img, Location, Offer, ProjectCard, Service, Settings, Testimonial } from './types'

/** Use the Sanity value when it has content, otherwise the fallback. */
const pick = <T,>(value: T | null | undefined, fallback: T): T => {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string' && value.trim() === '') return fallback
  if (Array.isArray(value) && value.length === 0) return fallback
  return value
}

const CARD = `_id, _updatedAt, title, "slug": slug.current, storyType, client, location, category, cardVideo, thumbnail`
/** Featured stories on Home: the card fields plus what the carousel shows (the job line, a summary, the film, a spare still). */
const FEATURED = `${CARD}, year, heroVideo, jobLine, "summary": caseStudy->summary, "still": caseStudy->gallery[1]`
const TESTIMONIAL = `_id, quote, name, role, organization, "projectSlug": project->slug.current`

export async function getSettings(): Promise<Settings> {
  const data = await sanityFetch<any>(`{
    "s": *[_id == "siteSettings"][0]{ tagline, footerDescription, email, phone, bookingLink, social, primaryCta, secondaryCta,
      closingEyebrow, closingHeadline, copyrightName, defaultSeo, notFoundEyebrow, notFoundHeadline, notFoundMessage,
      processSteps[]{ _key, title, line, clip, poster, youBring, youGet, inside } },
    "locations": *[_type == "location" && defined(slug.current)] | order(title asc){ _id, title, "slug": slug.current, baseLine, base }
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
    "page": *[_id == "homePage"][0]{ ..., testimonials[]->{ ${TESTIMONIAL} }, "proofProject": proofProject->{ title, "slug": slug.current } },
    "nwProject": *[_type == "project" && client match "North-Wright*" && defined(slug.current)] | order(coalesce(order, 999) asc)[0]{ title, "slug": slug.current },
    "featured": *[_type == "project" && featuredOnHome == true && defined(slug.current)] | order(coalesce(order, 999) asc)[0...6]{ ${FEATURED} },
    "latest": *[_type == "project" && defined(slug.current)] | order(coalesce(order, 999) asc, _createdAt desc)[0...6]{ ${FEATURED} },
    "logos": *[_type == "clientLogo" && showInStrip != false] | order(coalesce(order, 999) asc){ _id, name, logo, "ar": logo.asset->metadata.dimensions.aspectRatio }
  }`)
  const page = data?.page ?? {}
  const projects: FeaturedStory[] = pick(data?.featured, pick(data?.latest, SAMPLE_PROJECTS))
  const testimonials: Testimonial[] = pick(page.testimonials?.filter(Boolean), SAMPLE_TESTIMONIALS)
  const h = COPY.home
  return {
    heroReel: page.heroReel as string | undefined,
    heroPoster: page.heroPoster,
    fullReel: page.fullReel as string | undefined,
    heroEyebrow: pick(page.heroEyebrow, 'Video production · Alberta and the Northwest Territories'),
    heroTitle: pick(page.heroTitle, h.heroTitle),
    heroHeadline: pick(page.heroHeadline, 'We use film to go past the surface and show people what your organization is about.'),
    splashCue: pick(page.splashCue, h.splashCue),
    reelButton: pick(page.reelButton, h.reelButton),
    heroSubline: pick(page.heroSubline, 'We make films for companies, communities and other organizations. Our crew takes the time to know your people. That is how the real story comes out.'),
    problemEyebrow: pick(page.problemEyebrow, h.problemEyebrow),
    problemTitle: pick(page.problemTitle, h.problemTitle),
    problemBody: pick(page.problemBody, h.problemBody),
    hookVideo: page.hookVideo as string | undefined,
    hookPoster: page.hookPoster,
    beliefEyebrow: pick(page.beliefEyebrow, h.beliefEyebrow),
    beliefTitle: pick(page.beliefTitle, h.beliefTitle),
    beliefBody: pick(page.beliefBody, h.beliefBody),
    whoWeAre: pick(page.whoWeAre, WHO_WE_ARE),
    ladderEyebrow: pick(page.ladderEyebrow, h.ladderEyebrow),
    ladderTitle: pick(page.ladderTitle, h.ladderTitle),
    ladderIntro: pick(page.ladderIntro, h.ladderIntro),
    storiesEyebrow: pick(page.storiesEyebrow, 'Our work'),
    storiesTitle: pick(page.storiesTitle, h.storiesTitle),
    storiesLine: pick(page.storiesLine, h.storiesLine),
    storiesJobLabel: pick(page.storiesJobLabel, h.storiesJobLabel),
    fitEyebrow: pick(page.fitEyebrow, h.fitEyebrow),
    fitTitle: pick(page.fitTitle, h.fitTitle),
    fitHelper: pick(page.fitHelper, h.fitHelper),
    fitItems: pick<{ _key?: string; line: string; subline?: string }[]>(page.fitItems?.filter((x: { line?: string }) => x?.line), h.fitItems),
    fitClosing: pick(page.fitClosing, h.fitClosing),
    proofEyebrow: pick(page.proofEyebrow, h.proofEyebrow),
    proofTitle: pick(page.proofTitle, h.proofTitle),
    proofStats: pick<{ _key?: string; value: string; label: string }[]>(page.proofStats, h.proofStats),
    proofBody: pick(page.proofBody, h.proofBody),
    // The chosen proof story, else the first North-Wright Airways story, else none (link goes to all stories).
    proofProject: (page.proofProject ?? data?.nwProject ?? null) as { title: string; slug: string } | null,
    closingLine: pick(page.closingLine, h.closingLine),
    logoStripEyebrow: pick(page.logoStripEyebrow, 'Organizations we work with'),
    logoStripTitle: pick(page.logoStripTitle, 'Organizations we work with'),
    testimonialsEyebrow: pick(page.testimonialsEyebrow, 'What clients say'),
    testimonialsTitle: pick(page.testimonialsTitle, 'In their words'),
    testimonials,
    seo: page.seo ?? null,
    projects,
    logos: (data?.logos ?? []) as { _id: string; name: string; logo?: any; ar?: number }[],
  }
}

/**
 * How we film (the low-profile crew), on Home and About. Words from the Home page in Sanity, fallbacks in COPY.home.
 * Picture: the Home page's own, else the founder's on-location photo from the About page.
 */
export async function getCrew() {
  const d = await sanityFetch<any>(`{
    "p": *[_id == "homePage"][0]{ crewEyebrow, crewTitle, crewBody, crewImage, whoWeAre },
    "fallback": *[_id == "aboutPage"][0].founder->onLocationPhoto
  }`)
  const p = d?.p ?? {}
  const h = COPY.home
  return {
    eyebrow: pick<string>(p.crewEyebrow, h.crewEyebrow),
    title: pick<string>(p.crewTitle, h.crewTitle),
    body: pick<string>(p.crewBody, h.crewBody),
    whoWeAre: pick<string>(p.whoWeAre, WHO_WE_ARE),
    image: (p.crewImage?.asset ? p.crewImage : d?.fallback?.asset ? d.fallback : null) as Img,
  }
}

export async function getProjectBySlug(slug: string) {
  const data = await sanityFetch<any>(
    `*[_type == "project" && slug.current == $slug][0]{
      ${CARD}, year, heroVideo, heroImage, transcript, seo, "captionsUrl": captionsFile.asset->url,
      "services": services[]->{ title, "slug": slug.current },
      caseStudy->{ summary, brief, onTheGround, behindTheScenes, whatItDid, facts, challenge, peopleHeadline, people, peopleImage, whatMattered, gallery, resultsIntro, results,
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
    `*[_type == "service" && defined(slug.current)] | order(coalesce(order, 999) asc){ _id, _updatedAt, title, "slug": slug.current, summary, cardImage, showAsFullCard }`,
  )
  return withTraining(pick(rows, SAMPLE_SERVICES).filter((s) => !RETIRED_SERVICE_SLUGS.includes(s.slug)))
}

/** Add the placeholder Training videos service (src/lib/offers.ts) when Sanity has none, after the full cards and before “Also”. */
function withTraining(list: Service[]): Service[] {
  if (list.some((s) => s.slug === FALLBACK_TRAINING_SERVICE.slug)) return list
  const at = list.findIndex((s) => s.showAsFullCard === false)
  const out = [...list]
  out.splice(at === -1 ? out.length : at, 0, FALLBACK_TRAINING_SERVICE)
  return out
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  if (RETIRED_SERVICE_SLUGS.includes(slug)) return null
  const data = await sanityFetch<Service>(
    `*[_type == "service" && slug.current == $slug][0]{
      _id, title, "slug": slug.current, summary, cardImage, heroHeadline, clip, description, whoItsFor, included, timeline, timelineNote, faq, seo,
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
  if (slug === FALLBACK_TRAINING_SERVICE.slug) return FALLBACK_TRAINING_SERVICE
  return SAMPLE_SERVICES.find((s) => s.slug === slug) ?? null
}

/**
 * The Story Kit filmstrip (Home and the Story Kit page). Words from the Home page in Sanity (Filmstrip group),
 * with fallbacks in COPY.filmstrip. Each frame's picture: its own, else a real still from a featured story.
 */
export async function getFilmstrip(): Promise<Filmstrip> {
  const data = await sanityFetch<any>(`{
    "f": *[_id == "homePage"][0].filmstrip,
    "stills": *[_type == "project" && featuredOnHome == true && defined(slug.current)] | order(coalesce(order, 999) asc)[0...6]{ "img": coalesce(caseStudy->gallery[2], thumbnail), "extra": coalesce(caseStudy->gallery[3], caseStudy->gallery[1], thumbnail) }
  }`)
  const f = data?.f ?? {}
  const c = COPY.filmstrip
  const rows: { img?: Img; extra?: Img }[] = (data?.stills ?? []).filter((x: { img?: Img }) => x?.img?.asset)
  const frames: { _key?: string; title?: string; line?: string; kind?: FilmstripKind; image?: Img }[] = pick(f.frames, c.frames)
  return {
    title: pick(f.title, c.title),
    intro: pick(f.intro, c.intro),
    lead: pick(f.lead, c.lead),
    note: pick<string>(f.note, c.note),
    frames: frames.map((fr, i) => ({
      _key: fr._key ?? `f${i}`,
      title: fr.title ?? '',
      line: fr.line,
      // How the picture is shown: the frame's own choice, else by position (main film, short cuts, social, photos, website, plan).
      kind: fr.kind ?? FILMSTRIP_KINDS[i % FILMSTRIP_KINDS.length],
      image: fr.image?.asset ? fr.image : rows.length ? (rows[i % rows.length].img ?? null) : null,
      // A neighbouring still from the same film, for the mockups that show two pictures (short cuts, photos).
      extra: rows.length ? (rows[i % rows.length].extra ?? null) : null,
    })),
  }
}

/** Services page singleton (adds Process title to the simple-page fields). */
export async function getServicesPage() {
  const p = (await sanityFetch<any>(`*[_id == "servicesPage"][0]{ eyebrow, headline, intro, processTitle, ladderEyebrow, ladderTitle, ladderIntro, kindsEyebrow, kindsTitle, kindsIntro, seo }`)) ?? {}
  const c = COPY.services
  return {
    eyebrow: p.eyebrow as string | undefined,
    headline: p.headline as string | undefined,
    intro: pick(p.intro, c.intro),
    processTitle: p.processTitle as string | undefined,
    ladderEyebrow: pick(p.ladderEyebrow, c.ladderEyebrow),
    ladderTitle: pick(p.ladderTitle, c.ladderTitle),
    ladderIntro: pick(p.ladderIntro, c.ladderIntro),
    kindsEyebrow: pick(p.kindsEyebrow, c.kindsEyebrow),
    kindsTitle: pick(p.kindsTitle, c.kindsTitle),
    kindsIntro: pick(p.kindsIntro, c.kindsIntro),
    seo: p.seo ?? null,
  }
}

const OFFER_CARD = `_id, _updatedAt, name, "slug": slug.current, order, featured, badge, ladderLine, ladderBlurb, ladderLink, oneLiner, heroImage`

/** Fill each empty field of a Sanity offer from the code fallback with the same slug. */
function withFallback(o: Partial<Offer> & { slug: string }): Offer {
  const f = (FALLBACK_OFFERS.find((x) => x.slug === o.slug) ?? {}) as Partial<Offer>
  const merged: Record<string, unknown> = { ...f }
  for (const [k, v] of Object.entries(o)) merged[k] = pick(v as unknown, (f as Record<string, unknown>)[k])
  return { ...merged, _id: o._id ?? f._id ?? o.slug, name: pick(o.name, f.name ?? o.slug), slug: o.slug } as Offer
}

/** The offer ladder, in order. Falls back to the three code offers while Sanity has none. */
export async function getOffers(): Promise<Offer[]> {
  const rows = await sanityFetch<Offer[]>(`*[_type == "offer" && defined(slug.current)] | order(coalesce(order, 999) asc){ ${OFFER_CARD} }`)
  return rows?.length ? rows.map(withFallback) : FALLBACK_OFFERS
}

export async function getOfferBySlug(slug: string): Promise<Offer | null> {
  const data = await sanityFetch<any>(
    `*[_type == "offer" && slug.current == $slug][0]{
      ${OFFER_CARD}, heroHeadline, description, descriptionNote, includedTitle, included, idealFor, timeline, timelineNote, ctaLabel, closingHeadline, hookVideo, faq, seo,
      relatedServices[]->{ _id, title, "slug": slug.current },
      relatedProjects[]->{ ${CARD} }
    }`,
    { slug },
  )
  if (data) return withFallback(data)
  return FALLBACK_OFFERS.find((o) => o.slug === slug) ?? null
}

/** FAQ questions, ordered by category then order. Falls back to the code questions while Sanity has none. */
export async function getFaqItems(): Promise<FaqItem[]> {
  const rows = await sanityFetch<FaqItem[]>(
    `*[_type == "faqQuestion" && defined(question)] | order(coalesce(order, 999) asc, _createdAt asc){ _id, question, answer, category, order }`,
  )
  return pick(rows, FALLBACK_FAQ)
}

/** Questions for an offer page: its own, else the FAQ questions in its category. */
export async function getOfferFaq(offer: Offer): Promise<{ _key: string; question?: string; answer?: string }[]> {
  if (offer.faq?.length) return offer.faq
  const cat = OFFER_FAQ_CATEGORY[offer.slug]
  const all = await getFaqItems()
  return all.filter((q) => q.category === cat).map((q) => ({ _key: q._id, question: q.question, answer: q.answer }))
}

/** Locations page singleton: words from Sanity, fallbacks in COPY.locations. */
export async function getLocationsPage() {
  const p = (await sanityFetch<any>(`*[_id == "locationsPage"][0]{ eyebrow, headline, intro, seo }`)) ?? {}
  const c = COPY.locations
  return {
    eyebrow: pick<string>(p.eyebrow, c.eyebrow),
    headline: pick<string>(p.headline, c.headline),
    intro: pick<string>(p.intro, c.intro),
    seo: p.seo ?? null,
  }
}

export async function getFaqPage() {
  const p = (await sanityFetch<any>(`*[_id == "faqPage"][0]{ eyebrow, headline, intro, closingHeadline, seo }`)) ?? {}
  return {
    eyebrow: pick(p.eyebrow, COPY.faq.eyebrow),
    headline: pick(p.headline, COPY.faq.headline),
    intro: pick(p.intro, COPY.faq.intro),
    closingHeadline: pick(p.closingHeadline, COPY.faq.closingHeadline),
    seo: p.seo ?? null,
  }
}

export async function getLocation(slug: string) {
  const data = await sanityFetch<any>(
    `{
      "loc": *[_type == "location" && slug.current == $slug][0]{ ..., "slug": slug.current },
      "projects": *[_type == "project" && region->slug.current == $slug] | order(coalesce(order, 999) asc, _createdAt desc)[0...6]{ ${CARD} }
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
