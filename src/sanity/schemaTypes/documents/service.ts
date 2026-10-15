import { TagIcon } from '@sanity/icons/Tag'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { GROUPS, seoField } from '../objects/shared'

export const service = defineType({
  name: 'service',
  title: 'Service',
  type: 'document',
  icon: TagIcon,
  groups: GROUPS,
  fields: [
    defineField({ name: 'title', type: 'string', group: ['content', 'listing'], validation: (r) => r.required() }),
    defineField({ name: 'slug', type: 'slug', group: 'content', options: { source: 'title' }, validation: (r) => r.required() }),
    defineField({ name: 'summary', type: 'text', rows: 2, group: ['content', 'listing'] }),
    defineField({ name: 'cardImage', title: 'Card image', type: 'altImage', group: 'listing' }),
    defineField({
      name: 'showAsFullCard',
      title: 'Show as full card',
      description: 'Off = a smaller “also” tile (e.g. Photography)',
      type: 'boolean',
      group: 'listing',
      initialValue: true,
    }),
    defineField({ name: 'order', type: 'number', group: 'listing' }),
    defineField({ name: 'heroHeadline', title: 'Hero headline', type: 'string', group: 'content' }),
    defineField({ name: 'clip', title: 'Service clip', type: 'videoUrl', group: 'content' }),
    defineField({ name: 'whoItsFor', title: 'Who it’s for', type: 'portableText', group: 'content' }),
    defineField({
      name: 'included',
      title: 'What’s included',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'string' })],
    }),
    defineField({ name: 'timeline', title: 'Typical timeline', type: 'string', group: 'content' }),
    defineField({ name: 'timelineNote', title: 'Timeline note', type: 'text', rows: 2, group: 'content' }),
    defineField({
      name: 'relatedProjects',
      title: 'Related projects',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'project' }] })],
      validation: (r) => r.max(3),
    }),
    defineField({ name: 'testimonial', type: 'reference', to: [{ type: 'testimonial' }], group: 'content' }),
    defineField({
      name: 'faq',
      title: 'Questions',
      type: 'array',
      group: 'content',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'faqItem',
          fields: [
            defineField({ name: 'question', type: 'string' }),
            defineField({ name: 'answer', type: 'text', rows: 4 }),
          ],
          preview: { select: { title: 'question' } },
        }),
      ],
    }),
    defineField({
      name: 'targetSearch',
      title: 'Target search phrase',
      description: 'Internal note: the search this page should win. Not shown on the site.',
      type: 'string',
      group: 'seo',
    }),
    seoField,
  ],
  orderings: [{ title: 'Order', name: 'order', by: [{ field: 'order', direction: 'asc' }] }],
})
