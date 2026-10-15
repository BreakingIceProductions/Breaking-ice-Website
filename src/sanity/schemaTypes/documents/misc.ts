import { CommentIcon } from '@sanity/icons/Comment'
import { DocumentIcon } from '@sanity/icons/Document'
import { ImageIcon } from '@sanity/icons/Image'
import { PinIcon } from '@sanity/icons/Pin'
import { UserIcon } from '@sanity/icons/User'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { GROUPS, seoField, seoFieldTab } from '../objects/shared'

export const testimonial = defineType({
  name: 'testimonial',
  title: 'Testimonial',
  type: 'document',
  icon: CommentIcon,
  fields: [
    defineField({ name: 'quote', type: 'text', rows: 4, validation: (r) => r.required() }),
    defineField({ name: 'name', type: 'string' }),
    defineField({ name: 'role', type: 'string' }),
    defineField({ name: 'organization', type: 'string' }),
    defineField({ name: 'project', type: 'reference', to: [{ type: 'project' }] }),
  ],
  preview: { select: { title: 'name', subtitle: 'organization' } },
})

export const person = defineType({
  name: 'person',
  title: 'Person',
  type: 'document',
  icon: UserIcon,
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'role', type: 'string' }),
    defineField({ name: 'portrait', type: 'altImage' }),
    defineField({ name: 'onLocationPhoto', title: 'On-location photo', type: 'altImage' }),
    defineField({ name: 'founderNote', title: 'Founder note (first person)', type: 'portableText' }),
    defineField({ name: 'bio', type: 'portableText' }),
  ],
})

export const location = defineType({
  name: 'location',
  title: 'Location',
  type: 'document',
  icon: PinIcon,
  groups: GROUPS,
  fields: [
    defineField({ name: 'title', type: 'string', group: ['content', 'listing'], validation: (r) => r.required() }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'content',
      description: 'alberta or northwest-territories',
      options: { source: 'title' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'baseLine', title: 'Base line', description: 'e.g. Based in Stony Plain · Edmonton region', type: 'string', group: ['content', 'listing'] }),
    defineField({ name: 'summary', type: 'text', rows: 2, group: 'listing' }),
    defineField({ name: 'cardImage', title: 'Card image', type: 'altImage', group: 'listing' }),
    defineField({ name: 'headline', type: 'string', group: 'content' }),
    defineField({ name: 'intro', type: 'portableText', group: 'content' }),
    defineField({ name: 'heroImage', title: 'Hero image', type: 'altImage', group: 'content' }),
    defineField({ name: 'base', title: 'Base (town, province/territory)', type: 'string', group: 'content' }),
    defineField({ name: 'email', type: 'string', group: 'content' }),
    defineField({ name: 'phone', type: 'string', group: 'content' }),
    defineField({ name: 'travelNote', title: 'Travel note', type: 'text', rows: 3, group: 'content' }),
    defineField({
      name: 'areaServed',
      title: 'Area served',
      type: 'array',
      group: 'content',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'areaGroup',
          fields: [
            defineField({ name: 'name', title: 'Group name', type: 'string' }),
            defineField({ name: 'places', type: 'array', of: [defineArrayMember({ type: 'string' })] }),
          ],
          preview: { select: { title: 'name' } },
        }),
      ],
    }),
    defineField({ name: 'mapImage', title: 'Map image', type: 'altImage', group: 'content' }),
    seoFieldTab,
  ],
})

export const clientLogo = defineType({
  name: 'clientLogo',
  title: 'Client logo',
  type: 'document',
  icon: ImageIcon,
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'logo', type: 'image' }),
    defineField({ name: 'showInStrip', title: 'Show in strip', type: 'boolean', initialValue: true }),
    defineField({ name: 'order', type: 'number' }),
  ],
})

export const legalPage = defineType({
  name: 'legalPage',
  title: 'Legal page',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'slug', type: 'slug', options: { source: 'title' }, description: 'privacy or accessibility' }),
    defineField({ name: 'lastUpdated', title: 'Last updated', type: 'date' }),
    defineField({ name: 'body', type: 'portableText' }),
    seoField,
  ],
})
