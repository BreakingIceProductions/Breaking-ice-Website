import type { StructureResolver } from 'sanity/structure'

const singleton = (S: Parameters<StructureResolver>[0], type: string, title: string) =>
  S.listItem().title(title).id(type).child(S.document().schemaType(type).documentId(type).title(title))

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Breaking Ice')
    .items([
      S.listItem()
        .title('Pages')
        .child(
          S.list()
            .title('Pages')
            .items([
              singleton(S, 'homePage', 'Home'),
              singleton(S, 'aboutPage', 'About'),
              singleton(S, 'storiesPage', 'Stories'),
              singleton(S, 'servicesPage', 'Services'),
              singleton(S, 'contactPage', 'Contact'),
              singleton(S, 'faqPage', 'FAQ'),
              singleton(S, 'locationsPage', 'Locations'),
              S.documentTypeListItem('legalPage').title('Legal pages'),
            ]),
        ),
      S.divider(),
      S.documentTypeListItem('project').title('Projects'),
      S.documentTypeListItem('caseStudy').title('Case studies'),
      S.documentTypeListItem('offer').title('Offers'),
      S.documentTypeListItem('service').title('Services (kinds of film)'),
      S.documentTypeListItem('faqQuestion').title('FAQ questions'),
      S.documentTypeListItem('location').title('Locations'),
      S.documentTypeListItem('testimonial').title('Testimonials'),
      S.documentTypeListItem('person').title('People'),
      S.documentTypeListItem('clientLogo').title('Client logos'),
      S.divider(),
      singleton(S, 'siteSettings', 'Site settings'),
    ])
