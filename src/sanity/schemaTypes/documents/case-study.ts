import { DocumentTextIcon } from '@sanity/icons/DocumentText'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { GROUPS, seoFieldTab } from '../objects/shared'

export const SERVICE_TAGS = [
  { title: 'Brand film', value: 'brand-film' },
  { title: 'Recruitment video', value: 'recruitment-video' },
  { title: 'Event coverage', value: 'event-coverage' },
  { title: 'Documentary', value: 'documentary' },
  { title: 'Social series', value: 'social-series' },
  { title: 'Photography', value: 'photography' },
]
export const INDUSTRY_TAGS = [
  { title: 'Energy', value: 'energy' },
  { title: 'Aviation', value: 'aviation' },
  { title: 'Education', value: 'education' },
  { title: 'Government', value: 'government' },
  { title: 'Tourism and hospitality', value: 'tourism-hospitality' },
  { title: 'Trades and construction', value: 'trades-construction' },
  { title: 'Nonprofit', value: 'nonprofit' },
]
export const GOAL_TAGS = [
  { title: 'Recruitment', value: 'recruitment' },
  { title: 'Funder reporting', value: 'funder-reporting' },
  { title: 'Advocacy', value: 'advocacy' },
  { title: 'Community engagement', value: 'community-engagement' },
  { title: 'Sales and bookings', value: 'sales-bookings' },
  { title: 'Internal communications', value: 'internal-communications' },
]
export const REGION_TAGS = [
  { title: 'Northwest Territories', value: 'northwest-territories' },
  { title: 'Alberta', value: 'alberta' },
]

export const caseStudy = defineType({
  name: 'caseStudy',
  title: 'Case study',
  type: 'document',
  icon: DocumentTextIcon,
  groups: GROUPS,
  fields: [
    defineField({ name: 'internalTitle', title: 'Internal title', type: 'string', group: 'content' }),
    defineField({ name: 'summary', type: 'text', rows: 3, group: 'content' }),
    defineField({ name: 'client', description: 'Who it was for. Used where one case study covers several films.', type: 'string', group: ['content', 'listing'] }),
    defineField({ name: 'yearLabel', title: 'Year', description: 'e.g. 2026, or "2022 to now" for ongoing work.', type: 'string', group: ['content', 'listing'] }),
    defineField({ name: 'headlineResult', title: 'Headline result', description: 'The one line to remember, e.g. 90% of applicants via social.', type: 'string', group: ['content', 'listing'], validation: (r) => r.max(70).warning('Keep it short enough to read at a glance') }),
    // The story reads as one article: the brief, on the ground, what it did. Facts sit beside it.
    defineField({ name: 'brief', title: 'The brief', description: 'Who the client is, what they needed and why.', type: 'portableText', group: 'content' }),
    defineField({ name: 'peopleImage', title: 'Lead still', description: 'Shown between the brief and on the ground. Falls back to the first gallery still.', type: 'altImage', group: 'content' }),
    defineField({ name: 'onTheGround', title: 'On the ground', description: 'How it was made: the shoot, the people, what was hard.', type: 'portableText', group: 'content' }),
    defineField({
      name: 'behindTheScenes',
      title: 'Behind the scenes (optional)',
      description: 'A short anecdote, shown as a callout box.',
      type: 'object',
      group: 'content',
      fields: [
        defineField({ name: 'title', type: 'string' }),
        defineField({ name: 'body', type: 'text', rows: 3 }),
      ],
    }),
    defineField({ name: 'whatItDid', title: 'What it did', description: 'How the film was used and how people reacted.', type: 'portableText', group: 'content' }),
    defineField({
      name: 'facts',
      title: 'Quick facts',
      description: 'Shown in the sidebar under client, place and year. e.g. Shoot: 12 days on the river.',
      type: 'array',
      group: 'content',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'fact',
          fields: [
            defineField({ name: 'label', type: 'string' }),
            defineField({ name: 'value', type: 'string' }),
          ],
          preview: { select: { title: 'value', subtitle: 'label' } },
        }),
      ],
    }),
    // Earlier layout. Still read as a fallback until each case study is rewritten.
    defineField({ name: 'challenge', title: 'The challenge (old layout)', type: 'portableText', group: 'content', hidden: ({ value }) => !value }),
    defineField({ name: 'peopleHeadline', title: 'People headline (old layout)', type: 'string', group: 'content', hidden: ({ value }) => !value }),
    defineField({ name: 'people', title: 'The people (old layout)', type: 'portableText', group: 'content', hidden: ({ value }) => !value }),
    defineField({ name: 'whatMattered', title: 'What mattered (old layout)', type: 'portableText', group: 'content', hidden: ({ value }) => !value }),
    defineField({
      name: 'gallery',
      title: 'Stills gallery',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'altImage' })],
      options: { layout: 'grid' },
    }),
    defineField({ name: 'pullQuote', title: 'Pull quote', type: 'reference', to: [{ type: 'testimonial' }], group: 'content' }),
    defineField({ name: 'resultsIntro', title: 'Results intro (old layout)', type: 'text', rows: 2, group: 'content', hidden: ({ value }) => !value }),
    defineField({
      name: 'results',
      title: 'Results (old layout)',
      type: 'array',
      group: 'content',
      hidden: ({ value }) => !value?.length,
      of: [
        defineArrayMember({
          type: 'object',
          name: 'result',
          fields: [
            defineField({ name: 'headline', type: 'string' }),
            defineField({ name: 'detail', type: 'text', rows: 2 }),
          ],
        }),
      ],
    }),
    // Tags drive the filtered work pages and the related case studies links.
    defineField({ name: 'serviceTags', title: 'Service tags', type: 'array', group: 'listing', of: [defineArrayMember({ type: 'string' })], options: { list: SERVICE_TAGS, layout: 'grid' } }),
    defineField({ name: 'industryTags', title: 'Industry tags', type: 'array', group: 'listing', of: [defineArrayMember({ type: 'string' })], options: { list: INDUSTRY_TAGS, layout: 'grid' } }),
    defineField({ name: 'goalTags', title: 'Goal tags', type: 'array', group: 'listing', of: [defineArrayMember({ type: 'string' })], options: { list: GOAL_TAGS, layout: 'grid' } }),
    defineField({ name: 'regionTags', title: 'Region tags', type: 'array', group: 'listing', of: [defineArrayMember({ type: 'string' })], options: { list: REGION_TAGS, layout: 'grid' } }),
    defineField({ name: 'targetKeyword', title: 'Target keyword', description: 'The search phrase this case study should rank for. Not shown on the site.', type: 'string', group: 'seo' }),
    defineField({ name: 'editorNotes', title: 'Notes for Josh (not shown on the site)', description: 'Open questions, missing quotes or stills, and whether the client should review before publishing.', type: 'text', rows: 6, group: 'content' }),
    defineField({ name: 'nextProject', title: 'Next project', type: 'reference', to: [{ type: 'project' }], group: 'content' }),
    defineField({
      name: 'releasesOnFile',
      title: 'Releases on file',
      description:
        'Tick only when signed releases from everyone on camera or quoted are on file. This case study can’t be published until it’s ticked.',
      type: 'boolean',
      group: 'content',
      initialValue: false,
      validation: (r) =>
        r.custom((v) => v === true || 'Tick this once signed releases from everyone on camera are on file. A case study can’t be published without them.'),
    }),
    seoFieldTab,
  ],
  preview: { select: { title: 'internalTitle' } },
})
