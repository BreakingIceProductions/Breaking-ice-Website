import { caseStudy } from './documents/case-study'
import { clientLogo, legalPage, location, person, testimonial } from './documents/misc'
import { project } from './documents/project'
import { service } from './documents/service'
import { altImage, portableText, seo, videoUrl } from './objects/shared'
import { aboutPage, contactPage, homePage, servicesPage, siteSettings, storiesPage } from './singletons/pages'

export const SINGLETONS = ['siteSettings', 'homePage', 'aboutPage', 'storiesPage', 'servicesPage', 'contactPage']

export const schemaTypes = [
  // objects
  videoUrl,
  altImage,
  seo,
  portableText,
  // documents
  project,
  caseStudy,
  service,
  testimonial,
  person,
  location,
  clientLogo,
  legalPage,
  // singletons
  siteSettings,
  homePage,
  aboutPage,
  storiesPage,
  servicesPage,
  contactPage,
]
