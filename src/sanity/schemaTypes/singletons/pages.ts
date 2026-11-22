import { CogIcon } from '@sanity/icons/Cog'
import { DocumentIcon } from '@sanity/icons/Document'
import { HomeIcon } from '@sanity/icons/Home'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { COPY, WHO_WE_ARE } from '../../../lib/offers'
import { seoField, seoFieldTab } from '../objects/shared'

const text = (name: string, title?: string) => defineField({ name, title, type: 'string' })
const longText = (name: string, title?: string) => defineField({ name, title, type: 'text', rows: 3 })
/** A short text field that shows the site's built-in default as its help text. */
const copy = (name: string, title: string, fallback: string, group?: string) =>
  defineField({ name, title, type: 'string', group, description: `Leave empty to use “${fallback}”.` })

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  icon: CogIcon,
  groups: [
    { name: 'brand', title: 'Brand & contact', default: true },
    { name: 'process', title: 'Process steps' },
    { name: 'shared', title: 'Shared copy' },
    { name: 'notFound', title: '404 page' },
    { name: 'seo', title: 'SEO defaults' },
  ],
  fields: [
    defineField({ name: 'tagline', type: 'string', group: 'brand', initialValue: 'Past the surface.' }),
    defineField({ name: 'footerDescription', title: 'Footer description', type: 'text', rows: 2, group: 'brand' }),
    defineField({ name: 'email', type: 'string', group: 'brand' }),
    defineField({ name: 'phone', type: 'string', group: 'brand' }),
    defineField({ name: 'bookingLink', title: 'Booking link (Google appointment schedule)', type: 'url', group: 'brand' }),
    defineField({
      name: 'social',
      title: 'Social links',
      type: 'object',
      group: 'brand',
      fields: ['instagram', 'linkedin', 'youtube', 'vimeo'].map((n) => defineField({ name: n, type: 'url' })),
    }),
    defineField({ name: 'primaryCta', title: 'Primary CTA label', type: 'string', group: 'shared', initialValue: 'Start a conversation' }),
    defineField({ name: 'secondaryCta', title: 'Secondary CTA label', type: 'string', group: 'shared', initialValue: 'See the stories' }),
    defineField({ name: 'closingEyebrow', title: 'Closing band eyebrow', type: 'string', group: 'shared' }),
    defineField({ name: 'closingHeadline', title: 'Closing band headline', type: 'string', group: 'shared' }),
    defineField({
      name: 'processSteps',
      title: 'Process steps',
      type: 'array',
      group: 'process',
      validation: (r) => r.max(4),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'processStep',
          fields: [
            defineField({ name: 'title', type: 'string' }),
            defineField({ name: 'line', type: 'string' }),
            defineField({ name: 'clip', type: 'videoUrl' }),
            defineField({ name: 'poster', title: 'Clip still', description: 'Shown while the clip loads. A frame from the same moment as the clip.', type: 'altImage' }),
            defineField({ name: 'youBring', title: 'What you bring', type: 'string' }),
            defineField({ name: 'youGet', title: 'What you get', type: 'string' }),
            defineField({ name: 'inside', title: 'What’s inside', type: 'portableText' }),
          ],
        }),
      ],
    }),
    defineField({ name: 'copyrightName', title: 'Copyright name', type: 'string', group: 'shared', initialValue: 'Breaking Ice Productions' }),
    copy('notFoundEyebrow', '404 eyebrow', '404 · Page not found', 'notFound'),
    copy('notFoundHeadline', '404 headline', 'This page isn’t here.', 'notFound'),
    copy('notFoundMessage', '404 message', 'But the stories are.', 'notFound'),
    defineField({ name: 'defaultSeo', title: 'Default SEO', type: 'seo', group: 'seo' }),
  ],
  preview: { prepare: () => ({ title: 'Site settings' }) },
})

export const homePage = defineType({
  name: 'homePage',
  title: 'Home page',
  type: 'document',
  icon: HomeIcon,
  groups: [
    { name: 'hero', title: 'Hero', default: true },
    { name: 'sections', title: 'Sections' },
    { name: 'filmstrip', title: 'Story Kit filmstrip' },
    { name: 'fit', title: 'Is this you?' },
    { name: 'proof', title: 'Testimonials & proof' },
    { name: 'seo', title: 'SEO' },
    { name: 'retired', title: 'Old sections (not shown)' },
  ],
  fields: [
    defineField({ name: 'heroReel', title: 'Hero reel (silent loop)', type: 'videoUrl', group: 'hero' }),
    defineField({ name: 'heroPoster', title: 'Hero poster image', type: 'altImage', group: 'hero' }),
    defineField({ name: 'fullReel', title: 'Full reel (with sound)', type: 'videoUrl', group: 'hero' }),
    defineField({ ...text('heroEyebrow', 'Hero eyebrow'), group: 'hero' }),
    copy('heroTitle', 'Hero title (big headline)', COPY.home.heroTitle, 'hero'),
    defineField({ ...text('heroHeadline', 'Hero line under the title'), group: 'hero' }),
    defineField({ ...longText('heroSubline', 'Meta description fallback'), group: 'hero', description: 'Not shown on the page; used for Google when the SEO tab is empty.' }),
    copy('splashCue', 'Splash scroll cue', COPY.home.splashCue, 'hero'),
    copy('reelButton', 'Full reel button', COPY.home.reelButton, 'hero'),
    // The problem
    copy('problemEyebrow', 'Problem eyebrow', COPY.home.problemEyebrow, 'sections'),
    copy('problemTitle', 'Problem title', COPY.home.problemTitle, 'sections'),
    defineField({ ...longText('problemBody', 'Problem text'), group: 'sections', description: `Leave empty to use “${COPY.home.problemBody}”` }),
    defineField({ name: 'hookVideo', title: 'Hook video (optional)', type: 'videoUrl', group: 'sections', description: 'Shown beside the problem section only when set.' }),
    defineField({ name: 'hookPoster', title: 'Hook video still', type: 'altImage', group: 'sections', description: 'Optional. Defaults to the Vimeo thumbnail.' }),
    // What we believe (not shown on Home since the Nov 21 wireframe; the who-we-are line now sits under How we film)
    copy('beliefEyebrow', 'Belief eyebrow', COPY.home.beliefEyebrow, 'sections'),
    copy('beliefTitle', 'Belief title', COPY.home.beliefTitle, 'sections'),
    defineField({ ...longText('beliefBody', 'Belief text'), group: 'sections', description: `Leave empty to use “${COPY.home.beliefBody}”` }),
    defineField({ ...longText('whoWeAre', 'Who-we-are line'), group: 'sections', description: 'A plain, quotable sentence. Leave empty to use the built-in line.' }),
    // The ladder
    copy('ladderEyebrow', 'Offers eyebrow', COPY.home.ladderEyebrow, 'sections'),
    copy('ladderTitle', 'Offers title', COPY.home.ladderTitle, 'sections'),
    defineField({ ...longText('ladderIntro', 'Offers intro'), group: 'sections', description: `Leave empty to use “${COPY.home.ladderIntro}”` }),
    // Featured stories
    copy('storiesEyebrow', 'Stories eyebrow', 'Our work', 'sections'),
    copy('storiesTitle', 'Stories title', COPY.home.storiesTitle, 'sections'),
    copy('storiesLine', 'Stories second line', COPY.home.storiesLine, 'sections'),
    copy('storiesJobLabel', 'Stories “The job” label', COPY.home.storiesJobLabel, 'sections'),
    // How we film: the low-profile crew (also shown on About)
    copy('crewEyebrow', 'How we film eyebrow', COPY.home.crewEyebrow, 'sections'),
    copy('crewTitle', 'How we film title', COPY.home.crewTitle, 'sections'),
    defineField({ ...longText('crewBody', 'How we film text'), group: 'sections', description: `Also shown on the About page. Leave empty to use “${COPY.home.crewBody}”` }),
    defineField({ name: 'crewImage', title: 'How we film picture', type: 'altImage', group: 'sections', description: 'A real behind-the-scenes photo. Leave empty to use the founder’s on-location photo from the About page.' }),
    // Story Kit filmstrip (also shown on the Story Kit page)
    defineField({
      name: 'filmstrip',
      title: 'Story Kit filmstrip',
      description: 'Shown on Home and on the Story Kit page. Leave any part empty to use the built-in words.',
      type: 'object',
      group: 'filmstrip',
      fields: [
        copy('title', 'Heading', COPY.filmstrip.title),
        defineField({ ...longText('intro', 'Intro'), description: `Leave empty to use “${COPY.filmstrip.intro}”` }),
        copy('lead', 'Lead frame', COPY.filmstrip.lead),
        copy('note', 'Small note under the strip', COPY.filmstrip.note),
        defineField({
          name: 'frames',
          title: 'Frames',
          description: `Numbered in order. Leave empty to use the six built-in frames (${COPY.filmstrip.frames.map((f) => f.title).join(', ')}).`,
          type: 'array',
          validation: (r) => r.max(8),
          of: [
            defineArrayMember({
              type: 'object',
              name: 'filmstripFrame',
              fields: [
                defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
                defineField({ name: 'line', title: 'One line', type: 'string' }),
                defineField({ name: 'image', title: 'Still', type: 'altImage', description: 'Optional. Leave empty to use a still from a featured story.' }),
                defineField({
                  name: 'kind',
                  title: 'Show the picture as',
                  type: 'string',
                  description: 'Leave empty to follow the frame’s position (1 film, 2 short cuts, 3 social, 4 photos, 5 website, 6 plan).',
                  options: {
                    list: [
                      { title: 'Video player (main film)', value: 'film' },
                      { title: 'Stacked clips (short cuts)', value: 'cuts' },
                      { title: 'Phone (social clips)', value: 'social' },
                      { title: 'Printed photos', value: 'photos' },
                      { title: 'Browser window (website)', value: 'web' },
                      { title: 'Schedule card (rollout plan)', value: 'plan' },
                    ],
                  },
                }),
              ],
              preview: { select: { title: 'title', subtitle: 'line', media: 'image' } },
            }),
          ],
        }),
      ],
    }),
    // Is this you? checklist
    copy('fitEyebrow', 'Checklist eyebrow', COPY.home.fitEyebrow, 'fit'),
    copy('fitTitle', 'Checklist heading', COPY.home.fitTitle, 'fit'),
    copy('fitHelper', 'Checklist helper line', COPY.home.fitHelper, 'fit'),
    defineField({
      name: 'fitItems',
      title: 'Checklist items',
      description: 'A bold line and a short line under it. Leave empty to use the five built-in items.',
      type: 'array',
      group: 'fit',
      validation: (r) => r.max(8),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'fitItem',
          fields: [
            defineField({ name: 'line', title: 'Bold line', type: 'string', validation: (r) => r.required() }),
            defineField({ name: 'subline', title: 'Line under it', type: 'string' }),
          ],
          preview: { select: { title: 'line', subtitle: 'subline' } },
        }),
      ],
    }),
    copy('fitClosing', 'Checklist closing line', COPY.home.fitClosing, 'fit'),
    // Proof
    // Proof numbers and the logo strip are not shown on Home since the Nov 21 wireframe; kept for later.
    copy('proofEyebrow', 'Proof eyebrow', COPY.home.proofEyebrow, 'proof'),
    copy('proofTitle', 'Proof title', COPY.home.proofTitle, 'proof'),
    defineField({ ...longText('proofBody', 'Proof text'), group: 'proof', description: 'Approved figures only. Leave empty to use the North-Wright Airways paragraph.' }),
    defineField({
      name: 'proofStats',
      title: 'Proof numbers',
      description: 'Only approved, real numbers. Leave empty to use the North-Wright Airways numbers.',
      type: 'array',
      group: 'proof',
      validation: (r) => r.max(4),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'proofStat',
          fields: [defineField({ name: 'value', type: 'string' }), defineField({ name: 'label', type: 'string' })],
          preview: { select: { title: 'value', subtitle: 'label' } },
        }),
      ],
    }),
    defineField({ name: 'proofProject', title: 'Proof story (optional)', type: 'reference', to: [{ type: 'project' }], group: 'proof', description: 'Leave empty to link the first North-Wright Airways story (or all stories if there is none).' }),
    copy('logoStripEyebrow', 'Logo strip eyebrow', 'Organizations we work with', 'proof'),
    copy('logoStripTitle', 'Logo strip title (read by screen readers)', 'Organizations we work with', 'proof'),
    copy('testimonialsEyebrow', 'Testimonials eyebrow', 'What clients say', 'proof'),
    copy('testimonialsTitle', 'Testimonials title', 'In their words', 'proof'),
    defineField({
      name: 'testimonials',
      type: 'array',
      group: 'proof',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'testimonial' }] })],
    }),
    defineField({ ...longText('closingLine', 'Closing band line'), group: 'sections', description: `Leave empty to use “${COPY.home.closingLine}”` }),
    seoFieldTab,
    // Retired in the Nov 2026 restructure. Kept so nothing typed here is lost; the page no longer shows them.
    defineField({ ...text('introEyebrow', 'Intro eyebrow'), group: 'retired' }),
    defineField({ name: 'introBody', title: 'Intro', type: 'text', rows: 4, group: 'retired' }),
    defineField({
      name: 'stats',
      title: 'Stats (old)',
      type: 'array',
      group: 'retired',
      validation: (r) => r.max(4),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'stat',
          fields: [defineField({ name: 'value', type: 'string' }), defineField({ name: 'label', type: 'string' })],
        }),
      ],
    }),
    defineField({ ...text('processEyebrow', 'Process eyebrow'), group: 'retired' }),
    defineField({ ...text('processTitle', 'Process title'), group: 'retired' }),
    defineField({ ...text('checklistEyebrow', 'Checklist eyebrow'), group: 'retired' }),
    defineField({ ...text('checklistTitle', 'Checklist title'), group: 'retired' }),
    defineField({ name: 'situations', type: 'array', group: 'retired', of: [defineArrayMember({ type: 'string' })] }),
    defineField({ ...text('checklistClosing', 'Checklist closing line'), group: 'retired' }),
    defineField({ ...text('servicesEyebrow', 'Services eyebrow'), group: 'retired' }),
    defineField({ ...text('servicesTitle', 'Services title'), group: 'retired' }),
    defineField({ ...text('founderEyebrow', 'Founder eyebrow'), group: 'retired' }),
    defineField({ ...text('founderTitle', 'Founder title'), group: 'retired' }),
    defineField({ name: 'founder', type: 'reference', to: [{ type: 'person' }], group: 'retired' }),
    defineField({ ...text('locationsEyebrow', 'Locations eyebrow'), group: 'retired' }),
    defineField({ ...text('locationsTitle', 'Locations title'), group: 'retired' }),
  ],
  preview: { prepare: () => ({ title: 'Home page' }) },
})

export const aboutPage = defineType({
  name: 'aboutPage',
  title: 'About page',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    copy('heroEyebrow', 'Hero eyebrow', 'About'),
    text('heroHeadline', 'Hero headline'),
    longText('heroIntro', 'Hero intro'),
    defineField({ ...longText('whoWeAre', 'Who-we-are line'), description: `Leave empty to use “${WHO_WE_ARE}”` }),
    defineField({ name: 'heroVideo', title: 'Hero video', type: 'videoUrl' }),
    defineField({ name: 'heroPoster', title: 'Hero video still', description: 'Shown while the video loads.', type: 'altImage' }),
    copy('storyEyebrow', 'Story eyebrow', 'Our story'),
    text('storyTitle', 'Story title'),
    defineField({ name: 'storyBody', title: 'Story', type: 'portableText' }),
    copy('journeyEyebrow', 'Journey eyebrow', 'From the North to Alberta'),
    text('journeyTitle', 'Journey title'),
    defineField({ name: 'journeyNorthImage', title: 'Journey image (North)', type: 'altImage' }),
    copy('journeyNorthText', 'Journey text (North)', 'Where it began'),
    defineField({ name: 'journeyAlbertaImage', title: 'Journey image (Alberta)', type: 'altImage' }),
    copy('journeyAlbertaText', 'Journey text (Alberta)', 'Where we are now'),
    defineField({
      name: 'milestones',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'milestone',
          fields: [defineField({ name: 'year', type: 'string' }), defineField({ name: 'text', type: 'string' })],
        }),
      ],
    }),
    copy('processEyebrow', 'Process eyebrow', 'How we work'),
    copy('processTitle', 'Process title', 'Listen first'),
    copy('founderEyebrow', 'Founder eyebrow', 'Founder'),
    defineField({ name: 'founder', type: 'reference', to: [{ type: 'person' }] }),
    copy('beliefsEyebrow', 'Beliefs eyebrow', 'What we believe'),
    text('beliefsTitle', 'Beliefs title'),
    defineField({
      name: 'beliefs',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'belief',
          fields: [defineField({ name: 'title', type: 'string' }), defineField({ name: 'body', type: 'text', rows: 3 })],
        }),
      ],
    }),
    seoField,
  ],
  preview: { prepare: () => ({ title: 'About page' }) },
})

const simplePage = (name: string, title: string) =>
  defineType({
    name,
    title,
    type: 'document',
    icon: DocumentIcon,
    fields: [text('eyebrow'), text('headline'), longText('intro'), seoField],
    preview: { prepare: () => ({ title }) },
  })

export const storiesPage = simplePage('storiesPage', 'Stories page')
/** The /locations landing page (both regions). Empty fields use the built-in words in src/lib/offers.ts (COPY.locations). */
export const locationsPage = simplePage('locationsPage', 'Locations page')
export const faqPage = defineType({
  name: 'faqPage',
  title: 'FAQ page',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    copy('eyebrow', 'Eyebrow', COPY.faq.eyebrow),
    copy('headline', 'Headline', COPY.faq.headline),
    defineField({ ...longText('intro', 'Intro'), description: `Leave empty to use “${COPY.faq.intro}”` }),
    copy('closingHeadline', 'Closing headline', COPY.faq.closingHeadline),
    seoField,
  ],
  preview: { prepare: () => ({ title: 'FAQ page' }) },
})
export const servicesPage = defineType({
  name: 'servicesPage',
  title: 'Services page',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    text('eyebrow'),
    text('headline'),
    longText('intro'),
    copy('ladderEyebrow', 'Offers eyebrow', COPY.services.ladderEyebrow),
    copy('ladderTitle', 'Offers title', COPY.services.ladderTitle),
    defineField({ ...longText('ladderIntro', 'Offers intro'), description: `Leave empty to use “${COPY.services.ladderIntro}”` }),
    copy('kindsEyebrow', 'Kinds of film eyebrow', COPY.services.kindsEyebrow),
    copy('kindsTitle', 'Kinds of film title', COPY.services.kindsTitle),
    copy('kindsIntro', 'Kinds of film line', COPY.services.kindsIntro),
    defineField({ ...text('processTitle', 'Process title'), description: 'Defaults to “Four steps, every time”.' }),
    seoField,
  ],
  preview: { prepare: () => ({ title: 'Services page' }) },
})

export const contactPage = defineType({
  name: 'contactPage',
  title: 'Contact page',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    copy('eyebrow', 'Eyebrow', 'Contact'),
    text('headline'),
    longText('intro'),
    copy('submitLabel', 'Submit button label', 'Send'),
    copy('offerLabel', 'Offer question label', COPY.contact.offerLabel),
    copy('offerHelp', 'Offer question help text', COPY.contact.offerHelp),
    copy('storyLabel', 'Story field label', COPY.contact.storyLabel),
    copy('storyPlaceholder', 'Story field example text', COPY.contact.storyPlaceholder),
    defineField({ name: 'budgetOptions', type: 'array', of: [defineArrayMember({ type: 'string' })] }),
    defineField({ name: 'timelineOptions', type: 'array', of: [defineArrayMember({ type: 'string' })] }),
    defineField({ name: 'heardOptions', title: 'How did you hear options', type: 'array', of: [defineArrayMember({ type: 'string' })] }),
    longText('privacyLine', 'Privacy line'),
    defineField({
      name: 'nextSteps',
      title: 'What happens next',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'nextStep',
          fields: [defineField({ name: 'title', type: 'string' }), defineField({ name: 'text', type: 'string' })],
        }),
      ],
    }),
    copy('errorHeadline', 'Validation error headline', 'A couple of things need a look:'),
    defineField({
      ...text('deliveryErrorHeadline', 'Delivery error headline'),
      description: 'Shown when the message couldn’t be sent. Leave empty to show the specific reason (e.g. “Something went wrong on our end and your message didn’t send.”).',
    }),
    defineField({
      ...longText('deliveryErrorMessage', 'Delivery error message'),
      description: 'Leave empty to use “Nothing you typed is lost.” The email link and Try again button follow it.',
    }),
    text('successHeadline', 'Success headline'),
    longText('successMessage', 'Success message'),
    seoField,
  ],
  preview: { prepare: () => ({ title: 'Contact page' }) },
})
