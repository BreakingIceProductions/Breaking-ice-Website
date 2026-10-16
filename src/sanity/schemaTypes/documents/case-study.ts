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
    defineField({ name: 'challenge', title: 'The challenge', type: 'portableText', group: 'content' }),
    defineField({ name: 'peopleHeadline', title: 'People headline', type: 'string', group: 'content' }),
    defineField({ name: 'people', title: 'The people', type: 'portableText', group: 'content' }),
    defineField({ name: 'peopleImage', title: 'People image', type: 'altImage', group: 'content' }),
    defineField({ name: 'whatMattered', title: 'What mattered', type: 'portableText', group: 'content' }),
    defineField({
      name: 'gallery',
      title: 'Stills gallery',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'altImage' })],
      options: { layout: 'grid' },
    }),
    defineField({ name: 'pullQuote', title: 'Pull quote', type: 'reference', to: [{ type: 'testimonial' }], group: 'content' }),
    defineField({ name: 'resultsIntro', title: 'Results intro', type: 'text', rows: 2, group: 'content' }),
    defineField({
      name: 'results',
      type: 'array',
      group: 'content',
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
