import { DocumentTextIcon } from '@sanity/icons/DocumentText'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { GROUPS, seoFieldTab } from '../objects/shared'

export const caseStudy = defineType({
  name: 'caseStudy',
  title: 'Case study',
  type: 'document',
  icon: DocumentTextIcon,
  groups: GROUPS,
  fields: [
    defineField({ name: 'internalTitle', title: 'Internal title', type: 'string', group: 'content' }),
    defineField({ name: 'summary', type: 'text', rows: 3, group: 'content' }),
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
