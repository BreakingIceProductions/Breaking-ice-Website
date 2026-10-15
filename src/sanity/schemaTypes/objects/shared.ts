import { defineArrayMember, defineField, defineType } from 'sanity'

/** Categories drive both the badge on a story card and the filter chips on Stories. */
export const CATEGORIES = [
  { title: 'Energy & industry', value: 'energy-industry' },
  { title: 'Aviation', value: 'aviation' },
  { title: 'Indigenous governments & development corporations', value: 'indigenous-governments' },
  { title: 'Nonprofits & communities', value: 'nonprofits-communities' },
]

const VIDEO_URL = /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//

/** A YouTube or Vimeo link. The site builds the player from it. */
export const videoUrl = defineType({
  name: 'videoUrl',
  title: 'Video URL (YouTube or Vimeo)',
  type: 'url',
  validation: (rule) =>
    rule.custom((value) =>
      !value || VIDEO_URL.test(String(value)) ? true : 'Use a youtube.com, youtu.be or vimeo.com link',
    ),
})

/** Image with required alt text and hotspot cropping. */
export const altImage = defineType({
  name: 'altImage',
  title: 'Image',
  type: 'image',
  options: { hotspot: true },
  fields: [
    defineField({
      name: 'alt',
      title: 'Alt text (describe the picture)',
      type: 'string',
      validation: (rule) => rule.required().warning('Alt text helps people using screen readers, and Google'),
    }),
    defineField({ name: 'caption', type: 'string' }),
  ],
})

/** Page title, meta description and social image: on every routed document. */
export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  options: { collapsible: true, collapsed: false },
  fields: [
    defineField({
      name: 'title',
      title: 'Page title',
      type: 'string',
      validation: (rule) => rule.max(60).warning('Keep it under 60 characters so Google shows all of it'),
    }),
    defineField({
      name: 'description',
      title: 'Meta description',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.max(160).warning('Keep it under 160 characters'),
    }),
    defineField({ name: 'image', title: 'Social image (1200 × 630)', type: 'image' }),
  ],
})

export const portableText = defineType({
  name: 'portableText',
  title: 'Rich text',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'Normal', value: 'normal' },
        { title: 'Heading', value: 'h2' },
        { title: 'Subheading', value: 'h3' },
      ],
      lists: [
        { title: 'Bullets', value: 'bullet' },
        { title: 'Numbers', value: 'number' },
      ],
    }),
  ],
})

/** Shared field groups shown as tabs in the editor. */
export const GROUPS = [
  { name: 'content', title: 'Content', default: true },
  { name: 'listing', title: 'Cards & listings' },
  { name: 'seo', title: 'SEO' },
]

/** SEO field for documents without tabs. */
export const seoField = defineField({ name: 'seo', title: 'SEO', type: 'seo' })
/** SEO field for documents with Content / Cards & listings / SEO tabs. */
export const seoFieldTab = defineField({ name: 'seo', title: 'SEO', type: 'seo', group: 'seo' })
