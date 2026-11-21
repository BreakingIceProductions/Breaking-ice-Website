import { HelpCircleIcon } from '@sanity/icons/HelpCircle'
import { PackageIcon } from '@sanity/icons/Package'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { FAQ_CATEGORIES } from '../../../lib/offers'
import { GROUPS, seoFieldTab } from '../objects/shared'

/** The three ways to work with us (One-off Film, Story Kit, Brand Engine). Served at /services/[slug]. No prices. */
export const offer = defineType({
  name: 'offer',
  title: 'Offer',
  type: 'document',
  icon: PackageIcon,
  groups: GROUPS,
  fields: [
    defineField({ name: 'name', type: 'string', group: ['content', 'listing'], validation: (r) => r.required() }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'content',
      description: 'one-off-film, story-kit or brand-engine. Must not match a service slug.',
      options: { source: 'name' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'order', type: 'number', group: 'listing', description: 'Position on the ladder: 1, 2, 3.' }),
    defineField({
      name: 'featured',
      title: 'Emphasise on the ladder',
      type: 'boolean',
      group: 'listing',
      description: 'The navy step. Turn on for one offer only (Story Kit).',
    }),
    defineField({ name: 'badge', title: 'Ladder badge (optional)', type: 'string', group: 'listing', description: 'A small label on the ladder card. Usually left empty.' }),
    defineField({ name: 'ladderLine', title: 'Ladder one-liner', type: 'string', group: 'listing' }),
    defineField({ name: 'ladderBlurb', title: 'Ladder blurb', type: 'text', rows: 3, group: 'listing' }),
    defineField({ name: 'ladderLink', title: 'Ladder link text', type: 'string', group: 'listing', description: 'e.g. “More about the Story Kit”.' }),
    defineField({ name: 'heroHeadline', title: 'Hero headline', type: 'string', group: 'content' }),
    defineField({ name: 'oneLiner', title: 'One-liner (under the headline)', type: 'string', group: 'content' }),
    defineField({ name: 'description', type: 'portableText', group: 'content' }),
    defineField({ name: 'descriptionNote', title: 'Line under the description (optional)', type: 'string', group: 'content', description: 'One short line, e.g. the retainers note on the Brand Engine. Leave empty to use the built-in line, if any.' }),
    defineField({ name: 'includedTitle', title: 'List heading', type: 'string', group: 'content', description: 'e.g. “What you get” or “A typical kit includes”.' }),
    defineField({ name: 'included', title: 'What’s included', description: 'Start an item with a short sentence ending in a full stop to show it in bold.', type: 'array', group: 'content', of: [defineArrayMember({ type: 'string' })] }),
    defineField({ name: 'idealFor', title: 'Ideal for', type: 'array', group: 'content', of: [defineArrayMember({ type: 'string' })] }),
    defineField({ name: 'timeline', title: 'Usual timeline', type: 'string', group: 'content' }),
    defineField({ name: 'timelineNote', title: 'Timeline note', type: 'text', rows: 2, group: 'content' }),
    defineField({ name: 'ctaLabel', title: 'Button label', type: 'string', group: 'content', description: 'Leave empty to use “Start a conversation”.' }),
    defineField({ name: 'closingHeadline', title: 'Closing headline', type: 'string', group: 'content' }),
    defineField({ name: 'heroImage', title: 'Hero image', type: 'altImage', group: 'content', description: 'A real still from our work.' }),
    defineField({ name: 'hookVideo', title: 'Hook video (optional)', type: 'videoUrl', group: 'content', description: 'Shown only when set.' }),
    defineField({
      name: 'faq',
      title: 'Questions',
      description: 'Leave empty to show the matching questions from the FAQ.',
      type: 'array',
      group: 'content',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'offerQuestion',
          fields: [defineField({ name: 'question', type: 'string' }), defineField({ name: 'answer', type: 'text', rows: 4 })],
          preview: { select: { title: 'question' } },
        }),
      ],
    }),
    defineField({
      name: 'relatedServices',
      title: 'Related kinds of film',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'service' }] })],
    }),
    defineField({
      name: 'relatedProjects',
      title: 'Related stories',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'project' }] })],
      validation: (r) => r.max(3),
    }),
    seoFieldTab,
  ],
  orderings: [{ title: 'Order', name: 'order', by: [{ field: 'order', direction: 'asc' }] }],
  preview: { select: { title: 'name', subtitle: 'oneLiner' } },
})

/** One question on /faq. Grouped by category. */
export const faqQuestion = defineType({
  name: 'faqQuestion',
  title: 'FAQ question',
  type: 'document',
  icon: HelpCircleIcon,
  fields: [
    defineField({ name: 'question', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'answer', type: 'text', rows: 5, description: 'Plain words. No prices.' }),
    defineField({
      name: 'category',
      type: 'string',
      options: { list: FAQ_CATEGORIES.map((c) => ({ title: c.title, value: c.value })), layout: 'radio' },
      initialValue: 'general',
    }),
    defineField({ name: 'order', type: 'number', description: 'Position within its category.' }),
  ],
  orderings: [{ title: 'Order', name: 'order', by: [{ field: 'category', direction: 'asc' }, { field: 'order', direction: 'asc' }] }],
  preview: { select: { title: 'question', subtitle: 'category' } },
})
