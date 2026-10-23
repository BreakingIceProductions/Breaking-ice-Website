import { defineArrayMember, defineField } from 'sanity'
import { PIPELINE_STAGES, PROJECT_TYPES, REGIONS, SCHEDULE_KINDS } from './office-constants'

export * from './office-constants'

/**
 * Back-office fields on a client project: the business side clients never see.
 * The portal only ever reads the fields it names (see PROJECT_FIELDS in
 * src/portal/data.ts), so nothing here can reach a client.
 */

const G = 'office'

export const officeGroup = { name: G, title: 'Back office (private)' }

export const officeFields = [
  defineField({
    name: 'pipelineStage',
    title: 'Pipeline stage',
    description: 'Move stages from the back office (/admin) so the TickTick, Calendar and Xero steps run. Leads and quotes stay hidden from the client portal.',
    type: 'string',
    group: G,
    initialValue: 'lead',
    options: { list: [...PIPELINE_STAGES] },
  }),
  defineField({ name: 'projectType', title: 'Project type', type: 'string', group: G, options: { list: PROJECT_TYPES } }),
  defineField({ name: 'region', type: 'string', group: G, options: { list: REGIONS, layout: 'radio', direction: 'horizontal' } }),
  defineField({ name: 'quoteAmount', title: 'Quote total (CAD, before tax)', type: 'number', group: G, validation: (r) => r.min(0) }),
  defineField({
    name: 'depositAmount',
    title: 'Deposit (CAD, before tax)',
    description: 'Saved as a draft invoice in Xero when the project is booked. Leave empty for no deposit.',
    type: 'number',
    group: G,
    validation: (r) => r.min(0),
  }),
  defineField({ name: 'quoteUrl', title: 'Quote file link', description: 'e.g. the PDF in Drive (YYMMDD_Project_Quote).', type: 'url', group: G }),
  defineField({
    name: 'milestones',
    title: 'Milestones',
    description: 'These drive the calendar and the TickTick due dates. Change one and both follow within 10 minutes.',
    type: 'object',
    group: G,
    options: { collapsible: true, collapsed: false },
    fields: [
      defineField({ name: 'roughCutDue', title: 'Rough cut due', type: 'date' }),
      defineField({ name: 'round1Due', title: 'Round 1 feedback due (major)', type: 'date' }),
      defineField({ name: 'finalCutDue', title: 'Final cut due', type: 'date' }),
      defineField({ name: 'round2Due', title: 'Round 2 feedback due (minor)', type: 'date' }),
      defineField({ name: 'deliveryDue', title: 'Final delivery', type: 'date' }),
    ],
  }),
  defineField({
    name: 'schedule',
    title: 'Shoots, travel and meetings',
    type: 'array',
    group: G,
    of: [
      defineArrayMember({
        type: 'object',
        name: 'scheduleItem',
        fields: [
          defineField({ name: 'kind', type: 'string', initialValue: 'shoot', options: { list: SCHEDULE_KINDS, layout: 'radio', direction: 'horizontal' } }),
          defineField({ name: 'title', type: 'string', description: 'e.g. “Shoot day 1” or “Edmonton → Norman Wells”', validation: (r) => r.required() }),
          defineField({ name: 'start', title: 'Start date', type: 'date', validation: (r) => r.required() }),
          defineField({ name: 'end', title: 'End date (for multi-day blocks)', type: 'date' }),
          defineField({ name: 'time', title: 'Time (optional, 24-hour, e.g. 09:30)', type: 'string', validation: (r) => r.regex(/^([01]\d|2[0-3]):[0-5]\d$/, { name: '24-hour time' }) }),
          defineField({ name: 'location', type: 'string' }),
        ],
        preview: {
          select: { title: 'title', start: 'start', end: 'end', kind: 'kind' },
          prepare: ({ title, start, end, kind }) => ({ title, subtitle: [kind, start, end && `→ ${end}`].filter(Boolean).join(' · ') }),
        },
      }),
    ],
  }),
  defineField({
    name: 'crew',
    title: 'Crew and talent',
    type: 'array',
    group: G,
    of: [
      defineArrayMember({
        type: 'object',
        name: 'crewMember',
        fields: [defineField({ name: 'name', type: 'string' }), defineField({ name: 'role', type: 'string' })],
        preview: { select: { title: 'name', subtitle: 'role' } },
      }),
    ],
  }),
  defineField({
    name: 'retainer',
    title: 'Retainer',
    type: 'object',
    group: G,
    hidden: ({ parent }) => parent?.projectType !== 'retainer',
    fields: [
      defineField({ name: 'monthlyFee', title: 'Monthly fee (CAD, before tax)', type: 'number' }),
      defineField({ name: 'allowance', title: 'Monthly allowance', description: 'e.g. “4 short videos + 1 shoot day”', type: 'string' }),
    ],
  }),
]
