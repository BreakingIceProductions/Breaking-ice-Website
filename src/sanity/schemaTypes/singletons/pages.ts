import { CogIcon } from '@sanity/icons/Cog'
import { DocumentIcon } from '@sanity/icons/Document'
import { HomeIcon } from '@sanity/icons/Home'
import { defineArrayMember, defineField, defineType } from 'sanity'
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
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    defineField({ name: 'heroReel', title: 'Hero reel (silent loop)', type: 'videoUrl', group: 'hero' }),
    defineField({ name: 'heroPoster', title: 'Hero poster image', type: 'altImage', group: 'hero' }),
    defineField({ name: 'fullReel', title: 'Full reel (with sound)', type: 'videoUrl', group: 'hero' }),
    defineField({ ...text('heroEyebrow', 'Hero eyebrow'), group: 'hero' }),
    defineField({ ...text('heroHeadline', 'Hero headline'), group: 'hero' }),
    defineField({ ...longText('heroSubline', 'Hero subline'), group: 'hero' }),
    defineField({ ...text('introEyebrow', 'Intro eyebrow'), group: 'sections' }),
    defineField({ name: 'introBody', title: 'Intro', type: 'text', rows: 4, group: 'sections' }),
    defineField({
      name: 'stats',
      type: 'array',
      group: 'sections',
      validation: (r) => r.max(4),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'stat',
          fields: [defineField({ name: 'value', type: 'string' }), defineField({ name: 'label', type: 'string' })],
        }),
      ],
    }),
    copy('logoStripEyebrow', 'Logo strip eyebrow', 'Trusted by', 'sections'),
    copy('logoStripTitle', 'Logo strip title (read by screen readers)', 'Organizations we’ve worked with', 'sections'),
    copy('processEyebrow', 'Process eyebrow', 'How we work', 'sections'),
    defineField({ ...text('processTitle', 'Process title'), group: 'sections' }),
    copy('storiesEyebrow', 'Stories eyebrow', 'Selected stories', 'sections'),
    defineField({ ...text('storiesTitle', 'Stories title'), group: 'sections' }),
    copy('testimonialsEyebrow', 'Testimonials eyebrow', 'Testimonials', 'sections'),
    defineField({ ...text('testimonialsTitle', 'Testimonials title'), group: 'sections' }),
    defineField({
      name: 'testimonials',
      type: 'array',
      group: 'sections',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'testimonial' }] })],
    }),
    copy('checklistEyebrow', 'Checklist eyebrow', 'Sound familiar?', 'sections'),
    defineField({ ...text('checklistTitle', 'Checklist title'), group: 'sections' }),
    defineField({ name: 'situations', type: 'array', group: 'sections', of: [defineArrayMember({ type: 'string' })] }),
    defineField({ ...text('checklistClosing', 'Checklist closing line'), group: 'sections' }),
    copy('servicesEyebrow', 'Services eyebrow', 'Services', 'sections'),
    defineField({ ...text('servicesTitle', 'Services title'), group: 'sections' }),
    copy('founderEyebrow', 'Founder eyebrow', 'Founder', 'sections'),
    defineField({ ...text('founderTitle', 'Founder title'), group: 'sections' }),
    defineField({ name: 'founder', type: 'reference', to: [{ type: 'person' }], group: 'sections' }),
    copy('locationsEyebrow', 'Locations eyebrow', 'Locations', 'sections'),
    defineField({ ...text('locationsTitle', 'Locations title'), group: 'sections' }),
    seoFieldTab,
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
export const servicesPage = defineType({
  name: 'servicesPage',
  title: 'Services page',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    text('eyebrow'),
    text('headline'),
    longText('intro'),
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
